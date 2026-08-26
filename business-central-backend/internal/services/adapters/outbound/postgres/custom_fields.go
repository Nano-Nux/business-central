package postgres

import (
	"context"
	"encoding/json"
	"reflect"
	"regexp"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/services/application/dto"
	"github.com/jackc/pgx/v5"
)

var customFieldValueTypes = map[string]bool{
	"TEXT": true, "NUMBER": true, "BOOLEAN": true, "DATE": true, "SELECT": true, "JSON": true,
}

func jsonObjectOr(value json.RawMessage, fallback string) (json.RawMessage, error) {
	if len(value) == 0 {
		return json.RawMessage(fallback), nil
	}
	if !json.Valid(value) {
		return nil, app.Validation("Custom field configuration must be valid JSON.", nil)
	}
	return value, nil
}

func validateCustomFieldDefinitionRequest(x dto.CustomFieldDefinitionRequest) (string, json.RawMessage, json.RawMessage, json.RawMessage, error) {
	entityType := strings.ToUpper(strings.TrimSpace(x.EntityType))
	fieldScope := strings.ToUpper(strings.TrimSpace(x.FieldScope))
	valueType := strings.ToUpper(strings.TrimSpace(x.ValueType))
	if entityType == "" || strings.TrimSpace(x.FieldCode) == "" || strings.TrimSpace(x.Label) == "" {
		return "", nil, nil, nil, app.Validation("Custom field entity type, code, and label are required.", nil)
	}
	if fieldScope != "TICKET" && fieldScope != "WORK_ITEM" {
		return "", nil, nil, nil, app.Validation("Custom field scope must be TICKET or WORK_ITEM.", nil)
	}
	validEntity := fieldScope == "TICKET" && (entityType == "SERVICE_TICKET" || entityType == "REPAIR_TICKET") || fieldScope == "WORK_ITEM" && (entityType == "SERVICE_WORK_ITEM" || entityType == "REPAIR_WORK_ITEM")
	if !validEntity {
		return "", nil, nil, nil, app.Validation("The custom field entity type must match its ticket or work-item scope.", nil)
	}
	if serviceType := strings.ToUpper(strings.TrimSpace(stringValue(x.ServiceType))); serviceType != "" && serviceType != "GENERAL" && serviceType != "REPAIR" && serviceType != "CLINICAL" {
		return "", nil, nil, nil, app.Validation("Custom field service type must be GENERAL, REPAIR, or CLINICAL.", nil)
	}
	if !customFieldValueTypes[valueType] {
		return "", nil, nil, nil, app.Validation("Custom field value type is invalid.", map[string]any{"value_type": "unsupported"})
	}
	for _, r := range x.FieldCode {
		if !(r == '_' || r == '-' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9') {
			return "", nil, nil, nil, app.Validation("Custom field code may contain only letters, numbers, underscores, and hyphens.", nil)
		}
	}
	options, err := jsonObjectOr(x.Options, "[]")
	if err != nil {
		return "", nil, nil, nil, err
	}
	rules, err := jsonObjectOr(x.ValidationRules, "{}")
	if err != nil {
		return "", nil, nil, nil, err
	}
	visibility, err := jsonObjectOr(x.VisibilityRules, "{}")
	if err != nil {
		return "", nil, nil, nil, err
	}
	return valueType, options, rules, visibility, nil
}

func scanCustomFieldDefinition(rows pgx.Row) (dto.CustomFieldDefinition, error) {
	var v dto.CustomFieldDefinition
	if err := rows.Scan(&v.ID, &v.MerchantID, &v.EntityType, &v.ModuleCode, &v.ServiceType, &v.FieldScope, &v.FieldCode, &v.Label, &v.ValueType, &v.IsRequired, &v.Options, &v.ValidationRules, &v.VisibilityRules, &v.DisplayOrder, &v.Section, &v.Printable, &v.FormVersion, &v.IsActive, &v.CreatedAt, &v.UpdatedAt); err != nil {
		return v, err
	}
	return v, nil
}

const customFieldDefinitionColumns = `id,merchant_id,entity_type,module_code,service_type,field_scope,field_code,label,value_type,is_required,options,validation_rules,visibility_rules,display_order,section,printable,form_version,is_active,created_at,updated_at`

func (r *Repository) ListCustomFieldDefinitions(ctx context.Context, c *authdto.Claims, q app.ListQuery) ([]dto.CustomFieldDefinition, int, error) {
	where, args := scoped(c, q, "x", "concat(x.field_code,' ',x.label)")
	for _, key := range []string{"entity_type", "module_code", "service_type", "field_scope", "is_active"} {
		if value := q.Filter(key); value != "" {
			where, args = addFilter(where, args, "x."+key+"=$%d", value)
		}
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM custom_field_definitions x CROSS JOIN ctx WHERE "+where,
		"SELECT "+customFieldDefinitionColumns+" FROM custom_field_definitions x CROSS JOIN ctx WHERE "+where+" ORDER BY x.display_order,x.field_code", args, q,
		func(rows pgx.Rows) (dto.CustomFieldDefinition, error) {
			var v dto.CustomFieldDefinition
			if err := rows.Scan(&v.ID, &v.MerchantID, &v.EntityType, &v.ModuleCode, &v.ServiceType, &v.FieldScope, &v.FieldCode, &v.Label, &v.ValueType, &v.IsRequired, &v.Options, &v.ValidationRules, &v.VisibilityRules, &v.DisplayOrder, &v.Section, &v.Printable, &v.FormVersion, &v.IsActive, &v.CreatedAt, &v.UpdatedAt); err != nil {
				return v, err
			}
			return v, nil
		})
}

func (r *Repository) CreateCustomFieldDefinition(ctx context.Context, c *authdto.Claims, x dto.CustomFieldDefinitionRequest) (dto.CustomFieldDefinition, error) {
	valueType, options, rules, visibility, err := validateCustomFieldDefinitionRequest(x)
	if err != nil {
		return dto.CustomFieldDefinition{}, err
	}
	moduleCode := strings.ToUpper(strings.TrimSpace(x.ModuleCode))
	if moduleCode == "" {
		moduleCode = "SERVICE"
	}
	entityType := strings.ToUpper(strings.TrimSpace(x.EntityType))
	var serviceType *string
	if strings.TrimSpace(stringValue(x.ServiceType)) != "" {
		normalized := strings.ToUpper(strings.TrimSpace(stringValue(x.ServiceType)))
		serviceType = &normalized
	}
	active := true
	if x.IsActive != nil {
		active = *x.IsActive
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.CustomFieldDefinition, error) {
		var v dto.CustomFieldDefinition
		err := tx.QueryRow(ctx, `INSERT INTO custom_field_definitions(merchant_id,entity_type,module_code,service_type,field_scope,field_code,label,value_type,is_required,options,validation_rules,visibility_rules,display_order,section,printable,form_version,is_active)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16)
			RETURNING `+customFieldDefinitionColumns+``, c.MerchantID, entityType, moduleCode, serviceType, strings.ToUpper(x.FieldScope), x.FieldCode, x.Label, valueType, x.IsRequired, options, rules, visibility, x.DisplayOrder, x.Section, x.Printable, active).Scan(&v.ID, &v.MerchantID, &v.EntityType, &v.ModuleCode, &v.ServiceType, &v.FieldScope, &v.FieldCode, &v.Label, &v.ValueType, &v.IsRequired, &v.Options, &v.ValidationRules, &v.VisibilityRules, &v.DisplayOrder, &v.Section, &v.Printable, &v.FormVersion, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
		return v, err
	})
}

func (r *Repository) UpdateCustomFieldDefinition(ctx context.Context, c *authdto.Claims, id string, x dto.CustomFieldDefinitionRequest) (dto.CustomFieldDefinition, error) {
	valueType, options, rules, visibility, err := validateCustomFieldDefinitionRequest(x)
	if err != nil {
		return dto.CustomFieldDefinition{}, err
	}
	moduleCode := strings.ToUpper(strings.TrimSpace(x.ModuleCode))
	if moduleCode == "" {
		moduleCode = "SERVICE"
	}
	entityType := strings.ToUpper(strings.TrimSpace(x.EntityType))
	var serviceType *string
	if strings.TrimSpace(stringValue(x.ServiceType)) != "" {
		normalized := strings.ToUpper(strings.TrimSpace(stringValue(x.ServiceType)))
		serviceType = &normalized
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.CustomFieldDefinition, error) {
		active := true
		if x.IsActive != nil {
			active = *x.IsActive
		}
		var v dto.CustomFieldDefinition
		err := tx.QueryRow(ctx, `UPDATE custom_field_definitions SET entity_type=$3,module_code=$4,service_type=$5,field_scope=$6,field_code=$7,label=$8,value_type=$9,is_required=$10,options=$11,validation_rules=$12,visibility_rules=$13,display_order=$14,section=$15,printable=$16,form_version=form_version+1,is_active=$17,updated_at=now()
			WHERE merchant_id=$1::uuid AND id=$2::uuid
			RETURNING `+customFieldDefinitionColumns+``, c.MerchantID, id, entityType, moduleCode, serviceType, strings.ToUpper(x.FieldScope), x.FieldCode, x.Label, valueType, x.IsRequired, options, rules, visibility, x.DisplayOrder, x.Section, x.Printable, active).Scan(&v.ID, &v.MerchantID, &v.EntityType, &v.ModuleCode, &v.ServiceType, &v.FieldScope, &v.FieldCode, &v.Label, &v.ValueType, &v.IsRequired, &v.Options, &v.ValidationRules, &v.VisibilityRules, &v.DisplayOrder, &v.Section, &v.Printable, &v.FormVersion, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
		return v, err
	})
}

func (r *Repository) DeleteCustomFieldDefinition(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+`UPDATE custom_field_definitions SET is_active=FALSE,form_version=form_version+1,updated_at=now() WHERE merchant_id=$2::uuid AND id=$3::uuid`, c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListCustomFieldValues(ctx context.Context, c *authdto.Claims, entityType, entityID string, q app.ListQuery) ([]dto.CustomFieldValue, int, error) {
	where, args := scoped(c, q, "x", "")
	where, args = addFilter(where, args, "x.entity_type=$%d", entityType)
	where, args = addFilter(where, args, "x.entity_id=$%d::uuid", entityID)
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM custom_field_values x CROSS JOIN ctx WHERE "+where,
		"SELECT x.id,x.merchant_id,x.definition_id,x.entity_type,x.entity_id,x.form_version,x.value FROM custom_field_values x CROSS JOIN ctx WHERE "+where+" ORDER BY x.id", args, q,
		func(rows pgx.Rows) (dto.CustomFieldValue, error) {
			var v dto.CustomFieldValue
			return v, rows.Scan(&v.ID, &v.MerchantID, &v.DefinitionID, &v.EntityType, &v.EntityID, &v.FormVersion, &v.Value)
		})
}

func (r *Repository) customFieldMap(ctx context.Context, c *authdto.Claims, entityType, entityID string) (map[string]json.RawMessage, int, error) {
	values, _, err := r.ListCustomFieldValues(ctx, c, entityType, entityID, app.NewListQuery("", "", 0, 200))
	if err != nil {
		return nil, 0, err
	}
	fields := map[string]json.RawMessage{}
	version := 1
	for _, value := range values {
		var definition struct{ FieldCode string }
		if err := r.pool.QueryRow(ctx, contextPrefix()+`SELECT field_code FROM custom_field_definitions WHERE merchant_id=$2::uuid AND id=$3::uuid`, c.IdentityID, c.MerchantID, value.DefinitionID).Scan(&definition.FieldCode); err != nil {
			return nil, 0, err
		}
		fields[definition.FieldCode] = value.Value
		if value.FormVersion > version {
			version = value.FormVersion
		}
	}
	return fields, version, nil
}

func (r *Repository) UpsertCustomFieldValue(ctx context.Context, c *authdto.Claims, entityType, entityID string, x dto.CustomFieldValueRequest) (dto.CustomFieldValue, error) {
	if strings.TrimSpace(entityType) == "" || strings.TrimSpace(entityID) == "" || strings.TrimSpace(x.DefinitionID) == "" || len(x.Value) == 0 || !json.Valid(x.Value) {
		return dto.CustomFieldValue{}, app.Validation("A custom field value requires an entity, definition, and valid JSON value.", nil)
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.CustomFieldValue, error) {
		definition, err := loadCustomFieldDefinition(ctx, tx, c.MerchantID, x.DefinitionID)
		if err != nil {
			return dto.CustomFieldValue{}, err
		}
		normalizedEntityType := strings.ToUpper(strings.TrimSpace(entityType))
		scope, serviceType, entityErr := validateCustomFieldEntity(ctx, tx, c.MerchantID, normalizedEntityType, entityID)
		if entityErr != nil {
			return dto.CustomFieldValue{}, entityErr
		}
		if !customFieldDefinitionApplies(definition, normalizedEntityType, scope, serviceType) {
			return dto.CustomFieldValue{}, app.Validation("The custom field does not apply to this entity type.", nil)
		}
		if err := validateCustomFieldValue(definition, x.Value); err != nil {
			return dto.CustomFieldValue{}, err
		}
		version := definition.FormVersion
		if x.FormVersion != 0 && x.FormVersion != version {
			return dto.CustomFieldValue{}, app.Validation("The custom field form version is stale; reload the current form before saving.", map[string]any{"form_version": version})
		}
		var v dto.CustomFieldValue
		err = tx.QueryRow(ctx, `INSERT INTO custom_field_values(merchant_id,definition_id,entity_type,entity_id,form_version,value) VALUES($1,$2,$3,$4,$5,$6)
			ON CONFLICT (merchant_id,definition_id,entity_id) DO UPDATE SET entity_type=EXCLUDED.entity_type,form_version=EXCLUDED.form_version,value=EXCLUDED.value
			RETURNING id,merchant_id,definition_id,entity_type,entity_id,form_version,value`, c.MerchantID, x.DefinitionID, normalizedEntityType, entityID, version, x.Value).Scan(&v.ID, &v.MerchantID, &v.DefinitionID, &v.EntityType, &v.EntityID, &v.FormVersion, &v.Value)
		return v, err
	})
}

func (r *Repository) DeleteCustomFieldValue(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+`DELETE FROM custom_field_values x USING ctx WHERE x.merchant_id=$2::uuid AND x.id=$3::uuid`, c.IdentityID, c.MerchantID, id)
	return err
}

type customFieldDefinitionForValidation struct {
	ID              string
	EntityType      string
	FieldCode       string
	ValueType       string
	IsRequired      bool
	Options         json.RawMessage
	ValidationRules json.RawMessage
	VisibilityRules json.RawMessage
	FormVersion     int
	FieldScope      string
	ServiceType     *string
}

func loadCustomFieldDefinition(ctx context.Context, tx pgx.Tx, merchantID, id string) (customFieldDefinitionForValidation, error) {
	var v customFieldDefinitionForValidation
	err := tx.QueryRow(ctx, `SELECT id,entity_type,field_code,value_type,is_required,options,validation_rules,visibility_rules,form_version,field_scope,service_type FROM custom_field_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, merchantID, id).Scan(&v.ID, &v.EntityType, &v.FieldCode, &v.ValueType, &v.IsRequired, &v.Options, &v.ValidationRules, &v.VisibilityRules, &v.FormVersion, &v.FieldScope, &v.ServiceType)
	return v, err
}

func validateCustomFieldEntity(ctx context.Context, tx pgx.Tx, merchantID, entityType, entityID string) (string, string, error) {
	entityType = strings.ToUpper(strings.TrimSpace(entityType))
	var serviceType string
	var scope string
	var err error
	switch entityType {
	case "SERVICE_TICKET":
		scope = "TICKET"
		err = tx.QueryRow(ctx, `SELECT service_type FROM service_orders WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, entityID).Scan(&serviceType)
	case "REPAIR_TICKET":
		scope = "TICKET"
		err = tx.QueryRow(ctx, `SELECT so.service_type FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid`, merchantID, entityID).Scan(&serviceType)
	case "SERVICE_WORK_ITEM", "REPAIR_WORK_ITEM":
		scope = "WORK_ITEM"
		err = tx.QueryRow(ctx, `SELECT so.service_type FROM service_order_work_items wi JOIN service_orders so ON so.merchant_id=wi.merchant_id AND so.id=wi.service_order_id WHERE wi.merchant_id=$1::uuid AND wi.id=$2::uuid`, merchantID, entityID).Scan(&serviceType)
	default:
		return "", "", app.Validation("Custom field entity type is unsupported.", nil)
	}
	if err != nil {
		return "", "", err
	}
	return scope, serviceType, nil
}

func customFieldDefinitionApplies(def customFieldDefinitionForValidation, entityType, scope, serviceType string) bool {
	if def.FieldScope != scope || def.ServiceType != nil && *def.ServiceType != serviceType {
		return false
	}
	if def.EntityType == entityType {
		return true
	}
	return def.EntityType == "SERVICE_TICKET" && scope == "TICKET" || def.EntityType == "SERVICE_WORK_ITEM" && scope == "WORK_ITEM"
}

func customFieldConditionMatches(condition map[string]any, values map[string]json.RawMessage) bool {
	field, _ := condition["field"].(string)
	if field == "" {
		field, _ = condition["field_code"].(string)
	}
	if field == "" {
		return true
	}
	raw, exists := values[field]
	operator, _ := condition["operator"].(string)
	if operator == "" {
		operator = "equals"
	}
	if operator == "exists" {
		expected, ok := condition["value"].(bool)
		if !ok {
			expected = true
		}
		return exists == expected
	}
	if !exists {
		return operator == "not_equals" || operator == "not_in"
	}
	var actual any
	if err := json.Unmarshal(raw, &actual); err != nil {
		return false
	}
	expected, hasExpected := condition["value"]
	if !hasExpected {
		expected, hasExpected = condition["equals"]
	}
	if !hasExpected {
		return true
	}
	same := reflect.DeepEqual(actual, expected)
	switch operator {
	case "not_equals":
		return !same
	case "in", "not_in":
		options, ok := expected.([]any)
		if !ok {
			return false
		}
		contains := false
		for _, option := range options {
			if reflect.DeepEqual(actual, option) {
				contains = true
				break
			}
		}
		if operator == "not_in" {
			return !contains
		}
		return contains
	default:
		return same
	}
}

func customFieldVisible(rules json.RawMessage, values map[string]json.RawMessage) bool {
	if len(rules) == 0 || string(rules) == "{}" || string(rules) == "null" {
		return true
	}
	var configuration map[string]any
	if json.Unmarshal(rules, &configuration) != nil {
		return true
	}
	if all, ok := configuration["all"].([]any); ok {
		for _, entry := range all {
			condition, valid := entry.(map[string]any)
			if valid && !customFieldVisible(mustJSON(condition), values) {
				return false
			}
		}
		return true
	}
	if anyRules, ok := configuration["any"].([]any); ok {
		for _, entry := range anyRules {
			condition, valid := entry.(map[string]any)
			if valid && customFieldVisible(mustJSON(condition), values) {
				return true
			}
		}
		return len(anyRules) == 0
	}
	if nested, ok := configuration["when"].(map[string]any); ok {
		return customFieldConditionMatches(nested, values)
	}
	return customFieldConditionMatches(configuration, values)
}

func mustJSON(value any) json.RawMessage {
	raw, _ := json.Marshal(value)
	return raw
}

func validateCustomFieldValue(def customFieldDefinitionForValidation, raw json.RawMessage) error {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return app.Validation("Custom field value must be valid JSON.", map[string]any{"field": def.FieldCode})
	}
	switch def.ValueType {
	case "TEXT", "DATE", "SELECT":
		if _, ok := value.(string); !ok {
			return app.Validation("Custom field value must be text.", map[string]any{"field": def.FieldCode})
		}
	case "NUMBER":
		if _, ok := value.(float64); !ok {
			return app.Validation("Custom field value must be numeric.", map[string]any{"field": def.FieldCode})
		}
	case "BOOLEAN":
		if _, ok := value.(bool); !ok {
			return app.Validation("Custom field value must be boolean.", map[string]any{"field": def.FieldCode})
		}
	}
	if def.ValueType == "DATE" {
		if !validCustomFieldDate(value.(string)) {
			return app.Validation("Custom field date value is invalid.", map[string]any{"field": def.FieldCode})
		}
	}
	if def.ValueType == "SELECT" {
		var options []any
		if err := json.Unmarshal(def.Options, &options); err == nil && len(options) > 0 {
			found := false
			for _, option := range options {
				if option == value {
					found = true
					break
				}
				if object, ok := option.(map[string]any); ok && object["value"] == value {
					found = true
					break
				}
			}
			if !found {
				return app.Validation("Custom field selection is not one of the configured options.", map[string]any{"field": def.FieldCode})
			}
		}
	}
	var rules map[string]any
	if json.Unmarshal(def.ValidationRules, &rules) == nil {
		if min, ok := rules["min"].(float64); ok {
			if number, ok := value.(float64); ok && number < min {
				return app.Validation("Custom field value is below its minimum.", map[string]any{"field": def.FieldCode})
			}
		}
		if max, ok := rules["max"].(float64); ok {
			if number, ok := value.(float64); ok && number > max {
				return app.Validation("Custom field value is above its maximum.", map[string]any{"field": def.FieldCode})
			}
		}
		if pattern, ok := rules["pattern"].(string); ok {
			if text, ok := value.(string); ok {
				matched, err := regexp.MatchString(pattern, text)
				if err != nil || !matched {
					return app.Validation("Custom field value does not match its validation rule.", map[string]any{"field": def.FieldCode})
				}
			}
		}
	}
	return nil
}

func validCustomFieldDate(value string) bool {
	if _, err := time.Parse(time.RFC3339, value); err == nil {
		return true
	}
	_, err := time.Parse("2006-01-02", value)
	return err == nil
}

func validateAndStoreCustomFields(ctx context.Context, tx pgx.Tx, merchantID, entityType, fieldScope, serviceType, entityID string, values map[string]json.RawMessage) (int, error) {
	if values == nil {
		values = map[string]json.RawMessage{}
	}
	genericEntityType := "SERVICE_TICKET"
	if fieldScope == "WORK_ITEM" {
		genericEntityType = "SERVICE_WORK_ITEM"
	}
	rows, err := tx.Query(ctx, `SELECT id,entity_type,field_code,value_type,is_required,options,validation_rules,visibility_rules,form_version,field_scope,service_type FROM custom_field_definitions WHERE merchant_id=$1::uuid AND entity_type IN ($2,$5) AND field_scope=$3 AND is_active AND (service_type IS NULL OR service_type=$4) ORDER BY CASE WHEN entity_type=$2 THEN 1 ELSE 0 END,service_type NULLS FIRST,display_order`, merchantID, entityType, fieldScope, serviceType, genericEntityType)
	if err != nil {
		return 1, err
	}
	defer rows.Close()
	definitions := map[string]customFieldDefinitionForValidation{}
	formVersion := 1
	for rows.Next() {
		var def customFieldDefinitionForValidation
		if err := rows.Scan(&def.ID, &def.EntityType, &def.FieldCode, &def.ValueType, &def.IsRequired, &def.Options, &def.ValidationRules, &def.VisibilityRules, &def.FormVersion, &def.FieldScope, &def.ServiceType); err != nil {
			return 1, err
		}
		definitions[def.FieldCode] = def
		if def.FormVersion > formVersion {
			formVersion = def.FormVersion
		}
	}
	if err := rows.Err(); err != nil {
		return 1, err
	}
	for code, raw := range values {
		def, ok := definitions[code]
		if !ok {
			return 1, app.Validation("The submitted custom field is not part of the active form.", map[string]any{"field": code})
		}
		if err := validateCustomFieldValue(def, raw); err != nil {
			return 1, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO custom_field_values(merchant_id,definition_id,entity_type,entity_id,form_version,value) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (merchant_id,definition_id,entity_id) DO UPDATE SET form_version=EXCLUDED.form_version,value=EXCLUDED.value`, merchantID, def.ID, entityType, entityID, def.FormVersion, raw); err != nil {
			return 1, err
		}
	}
	for _, def := range definitions {
		if def.IsRequired && customFieldVisible(def.VisibilityRules, values) {
			if _, ok := values[def.FieldCode]; !ok {
				return 1, app.Validation("A required custom field is missing.", map[string]any{"field": def.FieldCode})
			}
		}
	}
	return formVersion, nil
}

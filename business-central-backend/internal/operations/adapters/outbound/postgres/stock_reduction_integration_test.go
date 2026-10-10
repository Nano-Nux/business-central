package postgres

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	authdto "business-central-backend/internal/auth/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
	syncpostgres "business-central-backend/internal/synchronization/adapters/outbound/postgres"
	syncdto "business-central-backend/internal/synchronization/application/dto"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestConfiguredDatabaseStockReduction(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 with an isolated test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	merchant, ownerID, staffID, managerID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	ownerMember, staffMember, managerMember := uuid.NewString(), uuid.NewString(), uuid.NewString()
	shop, otherShop, location, otherLocation := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	product, variant, unit, priceList := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	ownerRole, staffRole, managerRole := uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO user_identities(id,email,password_hash) VALUES($1,'owner-'||$1::uuid::text||'@stock.test','unused'),($2,'staff-'||$2::uuid::text||'@stock.test','unused'),($3,'manager-'||$3::uuid::text||'@stock.test','unused')`, ownerID, staffID, managerID)
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1,'Stock edits',$1::uuid::text,'USD')`, merchant)
	exec(`INSERT INTO shops(id,merchant_id,name,code) VALUES($1,$3,'Main','MAIN'),($2,$3,'Other','OTHER')`, shop, otherShop, merchant)
	exec(`INSERT INTO user_memberships(id,merchant_id,identity_id,display_name,shop_id) VALUES($1,$4,$5,'Owner',NULL),($2,$4,$6,'Staff',$8),($3,$4,$7,'Manager',$9)`, ownerMember, staffMember, managerMember, merchant, ownerID, staffID, managerID, shop, otherShop)
	exec(`INSERT INTO roles(id,merchant_id,code,name) VALUES($1,$4,'merchant','Merchant'),($2,$4,'staff','Staff'),($3,$4,'manager','Manager')`, ownerRole, staffRole, managerRole, merchant)
	exec(`INSERT INTO membership_roles(merchant_id,membership_id,role_id) VALUES($1,$2,$5),($1,$3,$6),($1,$4,$7)`, merchant, ownerMember, staffMember, managerMember, ownerRole, staffRole, managerRole)
	exec(`INSERT INTO role_permissions(role_id,permission_code) VALUES($1,'tenant.write'),($1,'tenant.read'),($1,'stock_in'),($2,'tenant.write'),($2,'tenant.read'),($2,'stock_in')`, staffRole, managerRole)
	exec(`INSERT INTO role_permissions(role_id,permission_code) VALUES($1,'tenant.write'),($1,'tenant.read')`, ownerRole)
	exec(`INSERT INTO locations(id,merchant_id,shop_id,code,name,location_type) VALUES($1,$3,$4,'MAIN','Main','STOCK_ROOM'),($2,$3,$5,'OTHER','Other','STOCK_ROOM')`, location, otherLocation, merchant, shop, otherShop)
	exec(`INSERT INTO unit_definitions(id,merchant_id,code,name,dimension_code,allows_decimal) VALUES($1,$2,'EA','Each','COUNT',false)`, unit, merchant)
	exec(`INSERT INTO products(id,merchant_id,name,product_type) VALUES($1,$2,'Tea','PHYSICAL')`, product, merchant)
	exec(`INSERT INTO product_variants(id,merchant_id,product_id,sku,name,base_unit_id) VALUES($1,$2,$3,'TEA','Box',$4)`, variant, merchant, product, unit)
	exec(`INSERT INTO price_lists(id,merchant_id,code,currency_code) VALUES($1,$2,'RETAIL','USD')`, priceList, merchant)
	exec(`INSERT INTO product_prices(merchant_id,price_list_id,variant_id,amount) VALUES($1,$2,$3,30)`, merchant, priceList, variant)
	// Run business operations as a normal application database role so RLS is
	// exercised, while the administrative connection owns only fixture setup.
	appRole := pgx.Identifier{"stock_app_" + uuid.NewString()[:8]}.Sanitize()
	exec("CREATE ROLE " + appRole)
	exec("GRANT USAGE ON SCHEMA public TO " + appRole)
	exec("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO " + appRole)
	exec("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO " + appRole)
	appConfig, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	appConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET ROLE "+appRole)
		return err
	}
	appPool, err := pgxpool.NewWithConfig(ctx, appConfig)
	if err != nil {
		t.Fatal(err)
	}
	defer appPool.Close()
	service := NewService(appPool)
	owner := &authdto.Claims{MerchantID: merchant, IdentityID: ownerID, MembershipID: ownerMember}
	staff := &authdto.Claims{MerchantID: merchant, IdentityID: staffID, MembershipID: staffMember}
	manager := &authdto.Claims{MerchantID: merchant, IdentityID: managerID, MembershipID: managerMember}
	receipt := operationsdto.StockInRequest{VariantID: variant, DestinationLocationID: location, UnitID: unit, Quantity: "5", UnitCost: "10", EventKey: uuid.NewString()}
	first, err := service.StockIn(ctx, owner, receipt)
	if err != nil {
		t.Fatal(err)
	}
	receipt.UnitCost = "20"
	receipt.EventKey = uuid.NewString()
	if _, err = service.StockIn(ctx, owner, receipt); err != nil {
		t.Fatal(err)
	}
	receipt.Quantity = "2"
	receipt.UnitCost = "5"
	receipt.DestinationLocationID = otherLocation
	receipt.EventKey = uuid.NewString()
	if _, err = service.StockIn(ctx, owner, receipt); err != nil {
		t.Fatal(err)
	}
	request := operationsdto.StockReductionRequest{VariantID: variant, SourceLocationID: location, Quantity: "6", Reason: "Physical count correction", EventKey: uuid.NewString()}
	for _, claims := range []*authdto.Claims{staff, manager} {
		if _, err = service.StockIn(ctx, claims, receipt); err == nil {
			t.Fatal("nonmerchant received inventory")
		}
		if _, err = service.ReduceStock(ctx, claims, request); err == nil {
			t.Fatal("nonmerchant reduced inventory")
		}
	}
	reduced, err := service.ReduceStock(ctx, owner, request)
	if err != nil {
		t.Fatal(err)
	}
	if reduced.MovementType != "ADJUSTMENT" || reduced.OrderLineID != nil || reduced.Quantity != "6.000000" {
		t.Fatalf("reduction became a sale or has wrong quantity: %+v", reduced)
	}
	duplicate, err := service.ReduceStock(ctx, owner, request)
	if err != nil || duplicate.ID != reduced.ID {
		t.Fatalf("replay failed: %+v %v", duplicate, err)
	}
	conflict := request
	conflict.Reason = "Different reason"
	if _, err = service.ReduceStock(ctx, owner, conflict); err == nil {
		t.Fatal("changed content reused an event key")
	}
	var quantity, cost string
	var layers, audits, changes int
	err = pool.QueryRow(ctx, `SELECT b.quantity_on_hand::text,(SELECT SUM(total_cost)::text FROM inventory_cost_allocations WHERE merchant_id=$1 AND consumption_movement_id=$4),
 (SELECT COUNT(*) FROM inventory_cost_allocations WHERE merchant_id=$1 AND consumption_movement_id=$4),
 (SELECT COUNT(*) FROM audit_events WHERE merchant_id=$1 AND entity_id=$4 AND after_data->>'reason'='Physical count correction'),
 (SELECT COUNT(*) FROM sync_changes WHERE merchant_id=$1 AND entity_id=$4 AND shop_id=$3 AND entity_type='STOCK_REDUCTION')
 FROM inventory_balances b WHERE b.merchant_id=$1 AND b.variant_id=$2 AND b.location_id=$5`, merchant, variant, shop, reduced.ID, location).Scan(&quantity, &cost, &layers, &audits, &changes)
	if err != nil {
		t.Fatal(err)
	}
	if quantity != "4.000000" || cost != "70.00" || layers != 2 || audits != 1 || changes != 1 {
		t.Fatalf("bad stock/FIFO/audit/change: %s %s %d %d %d", quantity, cost, layers, audits, changes)
	}
	// The original receipt remains intact; new movements carry all changes.
	var initial string
	if err = pool.QueryRow(ctx, `SELECT quantity::text FROM inventory_movements WHERE id=$1`, first.ID).Scan(&initial); err != nil || initial != "5.000000" {
		t.Fatalf("original receipt changed: %s %v", initial, err)
	}
	for _, test := range []struct {
		claims    *authdto.Claims
		count     string
		financial bool
	}{{owner, "6.000000", true}, {staff, "4.000000", false}, {manager, "2.000000", false}} {
		rows, err := service.ListStorage(ctx, test.claims)
		if err != nil || len(rows) != 1 {
			t.Fatalf("storage failed: %+v %v", rows, err)
		}
		if rows[0].StockCount != test.count || rows[0].SellPrice != "30.00" {
			t.Fatalf("wrong scope/pricing: %+v", rows[0])
		}
		if test.financial && rows[0].OriginalPrice == "" {
			t.Fatal("merchant cost hidden")
		}
		if !test.financial && (rows[0].OriginalPrice != "" || rows[0].Profit != "") {
			t.Fatalf("cost/profit leaked: %+v", rows[0])
		}
	}
	invalid := request
	invalid.EventKey = uuid.NewString()
	invalid.Quantity = "5"
	if _, err = service.ReduceStock(ctx, owner, invalid); err == nil {
		t.Fatal("negative stock permitted")
	}
	invalid.Quantity = "0.5"
	if _, err = service.ReduceStock(ctx, owner, invalid); err == nil {
		t.Fatal("fractional quantity allowed for whole unit")
	}
	invalid.Quantity = "1"
	foreignMerchant, foreignShop, foreignLocation, foreignProduct, foreignVariant := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1,'Other tenant',$1::uuid::text,'USD')`, foreignMerchant)
	exec(`INSERT INTO shops(id,merchant_id,name,code) VALUES($1,$2,'Foreign shop','FOREIGN')`, foreignShop, foreignMerchant)
	exec(`INSERT INTO locations(id,merchant_id,shop_id,name,code,location_type) VALUES($1,$2,$3,'Foreign stock','FOREIGN','STOCK_ROOM')`, foreignLocation, foreignMerchant, foreignShop)
	exec(`INSERT INTO products(id,merchant_id,name,product_type) VALUES($1,$2,'Foreign tea','PHYSICAL')`, foreignProduct, foreignMerchant)
	exec(`INSERT INTO product_variants(id,merchant_id,product_id,name,sku) VALUES($1,$2,$3,'Foreign box','FOREIGN')`, foreignVariant, foreignMerchant, foreignProduct)
	invalid.SourceLocationID = foreignLocation
	if _, err = service.ReduceStock(ctx, owner, invalid); err == nil {
		t.Fatal("foreign/missing location accepted")
	}
	invalid.SourceLocationID = location
	invalid.VariantID = foreignVariant
	if _, err = service.ReduceStock(ctx, owner, invalid); err == nil {
		t.Fatal("foreign/missing variant accepted")
	}
	// A receipt can increase stock again through the merged workflow's API.
	receipt.Quantity = "2"
	receipt.UnitCost = "30"
	receipt.DestinationLocationID = location
	receipt.EventKey = uuid.NewString()
	if _, err = service.StockIn(ctx, owner, receipt); err != nil {
		t.Fatal(err)
	}
	// A staff role with legacy stock_in and tenant.write cannot bypass the rule via sync.
	syncRepo := syncpostgres.NewRepository(pool)
	handshake, err := syncRepo.RegisterDevice(ctx, staff, syncdto.RegisterDeviceRequest{DeviceIdentifier: uuid.NewString(), ClientSessionKey: uuid.NewString(), Scope: "merchant"})
	if err != nil {
		t.Fatal(err)
	}
	receipt.DestinationLocationID = location
	receipt.EventKey = uuid.NewString()
	payload, _ := json.Marshal(receipt)
	pushed, err := syncRepo.Push(ctx, staff, syncdto.PushRequest{SessionID: handshake.Session.ID, Operations: []syncdto.Operation{{ClientOperationID: uuid.NewString(), EntityType: "STOCK_RECEIPT", EntityID: uuid.NewString(), ShopID: &shop, OperationType: "CREATE", Payload: payload}}})
	if err != nil || len(pushed.Results) != 1 || pushed.Results[0].Code != "MERCHANT_ONLY" || pushed.Results[0].Status != "REJECTED" {
		t.Fatalf("staff queued receipt bypassed role gate: %+v %v", pushed, err)
	}
	// Reserving four of the six units leaves only two available for corrections.
	order, line := uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO orders(id,merchant_id,order_number,channel,currency_code,fulfillment_location_id) VALUES($1,$2,$1::uuid::text,'POS','USD',$3)`, order, merchant, location)
	exec(`INSERT INTO order_lines(id,merchant_id,order_id,line_number,variant_id,unit_id,description,quantity,unit_price,line_total) VALUES($1,$2,$3,1,$4,$5,'Reserved tea',4,0,0)`, line, merchant, order, variant, unit)
	exec(`INSERT INTO inventory_reservations(merchant_id,order_line_id,location_id,variant_id,quantity,reservation_key) VALUES($1,$2,$3,$4,4,$2::uuid::text)`, merchant, line, location, variant)
	invalid = request
	invalid.EventKey = uuid.NewString()
	invalid.Quantity = "3"
	if _, err = service.ReduceStock(ctx, owner, invalid); err == nil {
		t.Fatal("reserved stock removed")
	}
	// Two concurrent reductions compete for the same two available units.
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			r := request
			r.EventKey = uuid.NewString()
			r.Quantity = "2"
			_, err := service.ReduceStock(ctx, owner, r)
			results <- err
		}()
	}
	successes := 0
	for i := 0; i < 2; i++ {
		if <-results == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent reductions succeeded %d times", successes)
	}
	exec(`UPDATE roles SET code='owner' WHERE id=$1`, ownerRole)
	rows, err := service.ListStorage(ctx, owner)
	if err != nil || len(rows) != 1 || rows[0].OriginalPrice == "" {
		t.Fatalf("owner alias lost financial access: %+v %v", rows, err)
	}
	exec(`UPDATE membership_roles SET granted_at=now()-interval '2 minutes',valid_until=now()-interval '1 minute' WHERE membership_id=$1`, ownerMember)
	if _, err = service.ReduceStock(ctx, owner, request); err == nil {
		t.Fatal("expired merchant role replayed a reduction")
	}
}

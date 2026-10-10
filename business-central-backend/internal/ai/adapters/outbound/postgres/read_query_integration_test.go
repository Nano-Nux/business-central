package postgres

import (
	"business-central-backend/internal/ai/domain"
	"business-central-backend/internal/ai/ports/outbound"
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

func aiTestPool(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("requires PostgreSQL with private-schema creation privileges")
	}
	admin, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	name := "ai_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quoted := pgx.Identifier{name}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		rows, err := admin.Query(cleanupCtx, `SELECT tablename FROM pg_tables WHERE schemaname=$1`, name)
		if err != nil {
			t.Error(err)
			return
		}
		names := []string{}
		for rows.Next() {
			var table string
			if err = rows.Scan(&table); err != nil {
				t.Error(err)
			}
			names = append(names, table)
		}
		rows.Close()
		for _, table := range names {
			if _, err = admin.Exec(cleanupCtx, "DROP TABLE IF EXISTS "+pgx.Identifier{name, table}.Sanitize()+" CASCADE"); err != nil {
				t.Error(err)
			}
		}
		if _, err = admin.Exec(cleanupCtx, "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Error(err)
		}
	})
	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = name + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	schema, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "schema.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(schema)); err != nil {
		t.Fatal(err)
	}
	// Use the actual AI persistence migration definitions in the private schema.
	migration, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "migrations", "0044_ai_assistant.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"ai_conversations", "ai_messages"} {
		ddl := regexp.MustCompile(`(?s)CREATE TABLE IF NOT EXISTS ` + table + ` \(.*?\);`).FindString(string(migration))
		if ddl == "" {
			t.Fatal("missing canonical AI table definition", table)
		}
		if _, err = pool.Exec(ctx, ddl); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = pool.Exec(ctx, `ALTER TABLE ai_conversations ADD COLUMN shop_id UUID REFERENCES shops(id)`); err != nil {
		t.Fatal(err)
	}
	return pool
}
func TestConfiguredDatabaseAIReadSecurity(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	pool := aiTestPool(t, ctx)
	r := &Repository{pool: pool}
	merchant, otherMerchant, shop, otherShop, foreignShop, identity, member, otherMember := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	otherIdentity := uuid.NewString()
	ctx = outbound.WithActor(ctx, identity)
	location, otherLocation, foreignLocation := uuid.NewString(), uuid.NewString(), uuid.NewString()
	seed, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer seed.Rollback(ctx)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := seed.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code,ai_usage_limit) VALUES($1::uuid,'AI test',$1::text,'USD',1),($2::uuid,'Other tenant',$2::text,'USD',1)`, merchant, otherMerchant)
	exec(`INSERT INTO shops(id,merchant_id,name,code) VALUES($1,$4,'Main','MAIN'),($2,$4,'Other','OTHER'),($3,$5,'Foreign','FOREIGN')`, shop, otherShop, foreignShop, merchant, otherMerchant)
	exec(`INSERT INTO user_identities(id,email,password_hash) VALUES($1::uuid,$1::text||'@example.test','unreadable'),($2::uuid,$2::text||'@example.test','unreadable')`, identity, otherIdentity)
	exec(`INSERT INTO user_memberships(id,merchant_id,identity_id,display_name,shop_id) VALUES($1,$3,$4,'Owner',NULL),($2,$3,$6,'Assigned staff',$5)`, member, otherMember, merchant, identity, shop, otherIdentity)
	exec(`INSERT INTO locations(id,merchant_id,shop_id,code,name,location_type) VALUES($1,$4,$6,'MAIN','Main','SHOP'),($2,$4,$7,'OTHER','Other','SHOP'),($3,$5,$8,'FOREIGN','Foreign','SHOP')`, location, otherLocation, foreignLocation, merchant, otherMerchant, shop, otherShop, foreignShop)
	exec(`INSERT INTO orders(merchant_id,fulfillment_location_id,order_number,channel,status,currency_code,subtotal,grand_total) VALUES($1,$3,'MAIN-USD','POS','CONFIRMED','USD',10,10),($1,$3,'MAIN-EUR','POS','CONFIRMED','EUR',20,20),($1,$4,'OTHER-USD','POS','CONFIRMED','USD',999,999),($2,$5,'FOREIGN-USD','POS','CONFIRMED','USD',777,777)`, merchant, otherMerchant, location, otherLocation, foreignLocation)
	exec(`INSERT INTO deliveries(merchant_id,shop_id,name,contact_info) VALUES($1,$2,'Main courier','123'),($1,$3,'Other courier','999')`, merchant, shop, otherShop)
	exec(`INSERT INTO order_lines(merchant_id,order_id,line_number,description,quantity,unit_price,line_total) SELECT merchant_id,id,1,'Service',1,grand_total,grand_total FROM orders WHERE merchant_id IN ($1::uuid,$2::uuid)`, merchant, otherMerchant)
	if err = seed.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	// Later fixture mutations use their own transactions.
	exec = func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	// Prove every static projection and scope is valid against the canonical schema.
	for _, staff := range []bool{false, true} {
		for _, d := range r.ReadCatalog(staff) {
			t.Run(d.Name+map[bool]string{false: "-owner", true: "-staff"}[staff], func(t *testing.T) {
				sql, args, err := CompileReadQuery(domain.ReadQuery{Dataset: d.Name}, merchant, shop, staff)
				if err != nil {
					t.Fatal(err)
				}
				rows, err := pool.Query(ctx, "EXPLAIN "+sql, args...)
				if err != nil {
					t.Fatal(err)
				}
				rows.Close()
			})
		}
	}
	conversation, err := r.CreateConversation(ctx, merchant, member, &shop, "Shop history")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = r.CreateConversation(ctx, merchant, member, &otherShop, "Other shop history"); err != nil {
		t.Fatal(err)
	}
	list, err := r.ListConversations(ctx, merchant, member, &shop, 50)
	if err != nil || len(list) != 1 || list[0].ID != conversation.ID {
		t.Fatalf("conversation list leaked across shops: %+v %v", list, err)
	}
	if _, err = r.ListConversations(ctx, merchant, member, nil, 50); err == nil {
		t.Fatal("repository accepted unscoped history")
	}
	saved, err := r.SaveMessage(ctx, domain.Message{ConversationID: conversation.ID, MerchantID: merchant, MembershipID: member, SenderType: domain.SenderUser, Content: "Shop question"})
	if err != nil || saved.ID == "" {
		t.Fatalf("message persistence failed: %v", err)
	}
	if _, err = r.SaveMessage(ctx, domain.Message{ConversationID: conversation.ID, MerchantID: merchant, MembershipID: otherMember, SenderType: domain.SenderUser, Content: "Wrong user"}); err == nil {
		t.Fatal("message ownership bypass")
	}
	messages, err := r.ListMessages(ctx, merchant, member, conversation.ID)
	if err != nil || len(messages) != 1 {
		t.Fatalf("message scope mismatch: %+v %v", messages, err)
	}
	rows, err := r.ExecuteReadOnlyQuery(ctx, merchant, member, shop, identity, domain.ReadQuery{Dataset: "orders", Columns: []string{"order_number", "grand_total"}}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 {
		t.Fatalf("shop query returned %d rows", len(rows))
	}
	for _, row := range rows {
		if !strings.HasPrefix(row["order_number"].(string), "MAIN-") {
			t.Fatal("cross-shop or cross-tenant row", row)
		}
	}
	totals, err := r.ExecuteReadOnlyQuery(ctx, merchant, member, shop, identity, domain.ReadQuery{Dataset: "orders", Aggregates: []domain.ReadAggregate{{Function: "sum", Column: "grand_total"}, {Function: "count"}}}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(totals) != 2 {
		t.Fatal("mixed currencies aggregated together", totals)
	}
	profits, err := r.ExecuteReadOnlyQuery(ctx, merchant, member, shop, identity, domain.ReadQuery{Dataset: "sales_profit", Columns: []string{"order_number", "gross_profit"}}, false)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range profits {
		if row["order_number"] == "MAIN-EUR" && row["gross_profit"] != nil {
			t.Fatal("combined base-currency cost with a different sales currency", row)
		}
	}
	couriers, err := r.ExecuteReadOnlyQuery(ctx, merchant, otherMember, shop, otherIdentity, domain.ReadQuery{Dataset: "deliveries"}, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(couriers) != 1 || couriers[0]["name"] != "Main courier" {
		t.Fatal("delivery scope leak", couriers)
	}
	for _, sid := range []string{otherShop, foreignShop} {
		if _, err = r.ExecuteReadOnlyQuery(ctx, merchant, otherMember, sid, otherIdentity, domain.ReadQuery{Dataset: "orders"}, true); err == nil {
			t.Fatal("unauthorized membership shop accepted")
		}
	}
	for _, q := range []domain.ReadQuery{{Dataset: "user_identities"}, {Dataset: "orders", Columns: []string{"*"}}, {Dataset: "orders;DELETE FROM orders"}, {Dataset: "sales_profit"}} {
		if _, err = r.ExecuteReadOnlyQuery(ctx, merchant, otherMember, shop, otherIdentity, q, true); err == nil {
			t.Fatal("unsafe dataset request accepted", q)
		}
	}
	if _, err = r.IncrementAIUsage(ctx, merchant); err != nil {
		t.Fatal(err)
	}
	if _, err = r.IncrementAIUsage(ctx, merchant); err == nil {
		t.Fatal("quota overshot")
	}
	exec(`UPDATE merchants SET ai_usage_count=0 WHERE id=$1`, merchant)
	var wg sync.WaitGroup
	var successes int
	var mu sync.Mutex
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := r.IncrementAIUsage(ctx, merchant); err == nil {
				mu.Lock()
				successes++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if successes != 1 {
		t.Fatalf("concurrent quota reservation succeeded %d times, expected one", successes)
	}
	// Membership changes take effect on the next read, independently of tokens.
	exec(`UPDATE user_memberships SET is_active=false WHERE id=$1`, otherMember)
	if _, err = r.ExecuteReadOnlyQuery(ctx, merchant, otherMember, shop, otherIdentity, domain.ReadQuery{Dataset: "orders"}, true); err == nil {
		t.Fatal("inactive member retained read access")
	}
}

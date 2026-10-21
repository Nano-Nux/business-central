package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"business-central-backend/internal/app"
	"business-central-backend/internal/receptionist/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ Pool *pgxpool.Pool }

func (r *Repository) Reserved(ctx context.Context, calendar string, span domain.Slot) (slots []domain.Slot, err error) {
	slots = []domain.Slot{}
	err = r.run(ctx, func(tx pgx.Tx) error {
		rows, e := tx.Query(ctx, `SELECT starts_at,ends_at FROM receptionist_bookings WHERE calendar_id=$1 AND status IN ('PENDING','CONFIRMED') AND starts_at<$3 AND ends_at>$2`, calendar, span.Start, span.End)
		if e != nil {
			return e
		}
		defer rows.Close()
		for rows.Next() {
			var slot domain.Slot
			if e = rows.Scan(&slot.Start, &slot.End); e != nil {
				return e
			}
			slots = append(slots, slot)
		}
		return rows.Err()
	})
	return
}

func (r *Repository) run(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT set_config('app.receptionist_service','on',true)`); err != nil {
		return err
	}
	if err = fn(tx); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return app.NewError("NOT_FOUND", "Record not found or expired.", 404)
		}
		return err
	}
	return tx.Commit(ctx)
}
func (r *Repository) Settings(ctx context.Context) (s domain.Settings, err error) {
	err = r.run(ctx, func(tx pgx.Tx) error {
		var b []byte
		e := tx.QueryRow(ctx, `SELECT settings FROM receptionist_settings WHERE singleton`).Scan(&b)
		if e != nil {
			return e
		}
		return json.Unmarshal(b, &s)
	})
	return
}
func (r *Repository) SaveSettings(ctx context.Context, s domain.Settings) error {
	return r.run(ctx, func(tx pgx.Tx) error {
		b, e := json.Marshal(s)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `UPDATE receptionist_settings SET settings=$1 WHERE singleton`, b)
		return e
	})
}
func (r *Repository) Token(ctx context.Context) (token string, err error) {
	err = r.run(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT refresh_ciphertext FROM receptionist_settings WHERE singleton`).Scan(&token)
	})
	return
}
func (r *Repository) SaveToken(ctx context.Context, token string) error {
	return r.run(ctx, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx, `UPDATE receptionist_settings SET refresh_ciphertext=$1 WHERE singleton`, token)
		return e
	})
}
func (r *Repository) SaveState(ctx context.Context, hash, verifier string) error {
	return r.run(ctx, func(tx pgx.Tx) error {
		if _, e := tx.Exec(ctx, `DELETE FROM receptionist_oauth_states WHERE expires_at<now()`); e != nil {
			return e
		}
		_, e := tx.Exec(ctx, `INSERT INTO receptionist_oauth_states(state_hash,verifier_ciphertext) VALUES($1,$2)`, hash, verifier)
		return e
	})
}
func (r *Repository) ConsumeState(ctx context.Context, hash string) (v string, err error) {
	err = r.run(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `DELETE FROM receptionist_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING verifier_ciphertext`, hash).Scan(&v)
	})
	return
}
func (r *Repository) State(ctx context.Context, hash string) (v string, err error) {
	err = r.run(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT verifier_ciphertext FROM receptionist_oauth_states WHERE state_hash=$1 AND expires_at>now()`, hash).Scan(&v)
	})
	return
}
func (r *Repository) CreateConversation(ctx context.Context, id, hash string) (c domain.Conversation, err error) {
	c.ID = id
	err = r.run(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `INSERT INTO receptionist_conversations(id,token_hash) VALUES($1,$2) RETURNING created_at,updated_at`, id, hash).Scan(&c.CreatedAt, &c.UpdatedAt)
	})
	return
}
func (r *Repository) Authorize(ctx context.Context, id, hash string) error {
	return r.run(ctx, func(tx pgx.Tx) error {
		var ok bool
		return tx.QueryRow(ctx, `SELECT true FROM receptionist_conversations WHERE id=$1 AND token_hash=$2 AND expires_at>now()`, id, hash).Scan(&ok)
	})
}
func (r *Repository) Conversation(ctx context.Context, id string) (c domain.Conversation, err error) {
	err = r.run(ctx, func(tx pgx.Tx) error {
		if e := tx.QueryRow(ctx, `SELECT id,name,email,company,created_at,updated_at FROM receptionist_conversations WHERE id=$1`, id).Scan(&c.ID, &c.Name, &c.Email, &c.Company, &c.CreatedAt, &c.UpdatedAt); e != nil {
			return e
		}
		rows, e := tx.Query(ctx, `SELECT id,role,content,slots,created_at FROM receptionist_messages WHERE conversation_id=$1 ORDER BY created_at,id`, id)
		if e != nil {
			return e
		}
		c.Messages = []domain.Message{}
		for rows.Next() {
			var m domain.Message
			var b []byte
			if e = rows.Scan(&m.ID, &m.Role, &m.Content, &b, &m.CreatedAt); e != nil {
				rows.Close()
				return e
			}
			if e = json.Unmarshal(b, &m.Slots); e != nil {
				rows.Close()
				return e
			}
			c.Messages = append(c.Messages, m)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return e
		}
		c.Bookings = []domain.Booking{}
		rows, e = tx.Query(ctx, `SELECT payload FROM receptionist_bookings WHERE conversation_id=$1 ORDER BY created_at`, id)
		if e != nil {
			return e
		}
		defer rows.Close()
		for rows.Next() {
			var b []byte
			var booking domain.Booking
			if e = rows.Scan(&b); e != nil {
				return e
			}
			if e = json.Unmarshal(b, &booking); e != nil {
				return e
			}
			c.Bookings = append(c.Bookings, booking)
		}
		return rows.Err()
	})
	return
}
func (r *Repository) Append(ctx context.Context, id string, m domain.Message) error {
	return r.run(ctx, func(tx pgx.Tx) error {
		slots := m.Slots
		if slots == nil {
			slots = []domain.Slot{}
		}
		b, e := json.Marshal(slots)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `INSERT INTO receptionist_messages(id,conversation_id,role,content,slots) VALUES($1,$2,$3,$4,$5)`, m.ID, id, m.Role, m.Content, b)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `UPDATE receptionist_conversations SET updated_at=now() WHERE id=$1`, id)
		return e
	})
}
func (r *Repository) ConsumeUsage(ctx context.Context, limit int) error {
	return r.run(ctx, func(tx pgx.Tx) error {
		var n int
		e := tx.QueryRow(ctx, `INSERT INTO receptionist_daily_usage(day,requests) VALUES((now() AT TIME ZONE 'UTC')::date,1) ON CONFLICT(day) DO UPDATE SET requests=receptionist_daily_usage.requests+1 WHERE receptionist_daily_usage.requests<$1 RETURNING requests`, limit).Scan(&n)
		if errors.Is(e, pgx.ErrNoRows) {
			return app.NewError("DAILY_LIMIT", "The receptionist has reached today's limit. Please try again tomorrow.", 429)
		}
		return e
	})
}
func (r *Repository) ListConversations(ctx context.Context, limit, offset int) (list []domain.Conversation, total int, err error) {
	list = []domain.Conversation{}
	err = r.run(ctx, func(tx pgx.Tx) error {
		if e := tx.QueryRow(ctx, `SELECT count(*) FROM receptionist_conversations`).Scan(&total); e != nil {
			return e
		}
		rows, e := tx.Query(ctx, `SELECT id,name,email,company,created_at,updated_at FROM receptionist_conversations ORDER BY updated_at DESC,id LIMIT $1 OFFSET $2`, limit, offset)
		if e != nil {
			return e
		}
		defer rows.Close()
		for rows.Next() {
			var c domain.Conversation
			if e = rows.Scan(&c.ID, &c.Name, &c.Email, &c.Company, &c.CreatedAt, &c.UpdatedAt); e != nil {
				return e
			}
			list = append(list, c)
		}
		return rows.Err()
	})
	return
}
func (r *Repository) ListBookings(ctx context.Context, limit, offset int, status string) (list []domain.Booking, total int, err error) {
	list = []domain.Booking{}
	err = r.run(ctx, func(tx pgx.Tx) error {
		if e := tx.QueryRow(ctx, `SELECT count(*) FROM receptionist_bookings WHERE ($1='' OR status=$1)`, status).Scan(&total); e != nil {
			return e
		}
		rows, e := tx.Query(ctx, `SELECT payload FROM receptionist_bookings WHERE ($1='' OR status=$1) ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`, status, limit, offset)
		if e != nil {
			return e
		}
		defer rows.Close()
		for rows.Next() {
			var b []byte
			var booking domain.Booking
			if e = rows.Scan(&b); e != nil {
				return e
			}
			if e = json.Unmarshal(b, &booking); e != nil {
				return e
			}
			list = append(list, booking)
		}
		return rows.Err()
	})
	return
}
func (r *Repository) Booking(ctx context.Context, id string) (b domain.Booking, err error) {
	err = r.run(ctx, func(tx pgx.Tx) error {
		var data []byte
		if e := tx.QueryRow(ctx, `SELECT payload FROM receptionist_bookings WHERE id=$1`, id).Scan(&data); e != nil {
			return e
		}
		return json.Unmarshal(data, &b)
	})
	return
}
func (r *Repository) Reserve(ctx context.Context, b domain.Booking) error {
	return r.run(ctx, func(tx pgx.Tx) error {
		var overlap bool
		if e := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM receptionist_bookings WHERE calendar_id=$1 AND status IN ('PENDING','CONFIRMED') AND starts_at<$3 AND ends_at>$2)`, b.CalendarID, b.Start, b.End).Scan(&overlap); e != nil {
			return e
		}
		if overlap {
			return app.NewError("SLOT_UNAVAILABLE", "This time is already reserved. Choose another slot.", 409)
		}
		data, e := json.Marshal(b)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `INSERT INTO receptionist_bookings(id,conversation_id,calendar_id,starts_at,ends_at,status,payload) VALUES($1,$2,$3,$4,$5,$6,$7)`, b.ID, b.ConversationID, b.CalendarID, b.Start, b.End, b.Status, data)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `UPDATE receptionist_conversations SET name=$2,email=$3,company=$4,updated_at=now() WHERE id=$1`, b.ConversationID, b.Name, b.Email, b.Company)
		return e
	})
}
func (r *Repository) FinishBooking(ctx context.Context, b domain.Booking) error {
	return r.run(ctx, func(tx pgx.Tx) error {
		data, e := json.Marshal(b)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `UPDATE receptionist_bookings SET status=$2,payload=$3 WHERE id=$1`, b.ID, b.Status, data)
		return e
	})
}
func (r *Repository) WithLock(ctx context.Context, key string, fn func() error) error {
	conn, e := r.Pool.Acquire(ctx)
	if e != nil {
		return e
	}
	defer conn.Release()
	var ok bool
	if e = conn.QueryRow(ctx, `SELECT pg_try_advisory_lock(hashtextextended($1,0))`, "receptionist:"+key).Scan(&ok); e != nil {
		return e
	}
	if !ok {
		return app.NewError("BUSY", "A request is already in progress. Please retry shortly.", 409)
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := conn.Exec(cleanup, `SELECT pg_advisory_unlock(hashtextextended($1,0))`, "receptionist:"+key); err != nil {
			_ = conn.Conn().Close(cleanup)
		}
	}()
	return fn()
}

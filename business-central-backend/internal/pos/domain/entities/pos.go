package entities

import (
	"errors"
	"strconv"
	"strings"
)

var ErrRequired = errors.New("a required POS field is missing")
var ErrInvalidStatus = errors.New("POS session status is invalid")

const (
	SessionOpen   = "OPEN"
	SessionClosed = "CLOSED"
)

type SessionAggregate struct {
	Status string
}

func NewSession(status string) (SessionAggregate, error) {
	if err := ValidateStatus(status); err != nil {
		return SessionAggregate{}, err
	}
	if status == "" {
		status = SessionOpen
	}
	return SessionAggregate{Status: status}, nil
}

func (s *SessionAggregate) Close()  { s.Status = SessionClosed }
func (s *SessionAggregate) Reopen() { s.Status = SessionOpen }

func ValidateStatus(status string) error {
	if status != "" && status != SessionOpen && status != SessionClosed {
		return ErrInvalidStatus
	}
	return nil
}

func Shop(name, code string) error {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(code) == "" {
		return ErrRequired
	}
	return nil
}

func Terminal(shopID, name string) error {
	if strings.TrimSpace(shopID) == "" || strings.TrimSpace(name) == "" {
		return ErrRequired
	}
	return nil
}

func Session(shopID, membershipID, status string) error {
	if strings.TrimSpace(shopID) == "" || strings.TrimSpace(membershipID) == "" {
		return ErrRequired
	}
	return ValidateStatus(status)
}

func Sale(lines int, paymentTypeID, paymentMethod, idempotencyKey string) error {
	if lines == 0 || (strings.TrimSpace(paymentTypeID) == "" && strings.TrimSpace(paymentMethod) == "") || strings.TrimSpace(idempotencyKey) == "" {
		return ErrRequired
	}
	return nil
}

func Refund(paymentID, amount, idempotencyKey string) error {
	if strings.TrimSpace(paymentID) == "" || strings.TrimSpace(amount) == "" || strings.TrimSpace(idempotencyKey) == "" {
		return ErrRequired
	}
	value, err := strconv.ParseFloat(strings.TrimSpace(amount), 64)
	if err != nil || value <= 0 {
		return errors.New("POS refund amount is invalid")
	}
	return nil
}

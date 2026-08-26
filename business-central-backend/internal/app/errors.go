package app

import "fmt"

type Error struct {
	Code     string
	Message  string
	Status   int
	Fields   map[string]any
	Internal error
}

func (e *Error) Error() string {
	if e.Internal != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Internal)
	}
	return e.Message
}

func (e *Error) Unwrap() error { return e.Internal }

func NewError(code, message string, status int) *Error {
	return &Error{Code: code, Message: message, Status: status}
}

func Internal(err error) *Error {
	return &Error{Code: "INTERNAL_ERROR", Message: "An unexpected server error occurred.", Status: 500, Internal: err}
}

func Validation(message string, fields map[string]any) *Error {
	return &Error{Code: "VALIDATION_ERROR", Message: message, Status: 400, Fields: fields}
}

package domain

import (
	"strings"
	"testing"
)

func TestResponseLanguageInstruction(t *testing.T) {
	for _, tc := range []struct {
		question string
		myanmar  bool
	}{
		{"အရင်လ က ဘယ်လောက် ရောင်းရလဲ", true},
		{"အရင်လက ဘယ်လောက် မြတ်လဲ", true},
		{"အရင်လက profit ဘယ်လောက်လဲ", true},
		{"total profit in MMK", false},
		{"show sales for customer မောင်", false},
		{"ยอดขายเดือนที่แล้วเท่าไหร่", false},
		{"150,000.00 MMK", false},
		{"", false},
	} {
		t.Run(tc.question, func(t *testing.T) {
			if got := IsMyanmarQuestion(tc.question); got != tc.myanmar {
				t.Fatalf("Myanmar classification = %v, want %v", got, tc.myanmar)
			}
			instruction := ResponseLanguageInstruction(tc.question)
			if !strings.Contains(instruction, "language of the latest user question") || !strings.Contains(instruction, "metric labels, table headings") {
				t.Fatal("missing shared language rules")
			}
			if strings.Contains(instruction, "write the user-facing response in Myanmar") != tc.myanmar {
				t.Fatal("explicit Myanmar directive does not match the question")
			}
		})
	}
}

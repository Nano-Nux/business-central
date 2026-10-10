package valueobjects

import "testing"

func TestNormalizePOSMode(t *testing.T) {
	for _, test := range []struct {
		input, want string
		valid       bool
	}{
		{"", "NANO", true}, {" nano ", "NANO", true},
		{"MINI", "MINI", true}, {"SIMPLE", "SIMPLE", true}, {"COMPLEX", "COMPLEX", true},
		{"UNKNOWN", "", false},
	} {
		got, valid := NormalizePOSMode(test.input)
		if got != test.want || valid != test.valid {
			t.Errorf("NormalizePOSMode(%q) = %q, %v; want %q, %v", test.input, got, valid, test.want, test.valid)
		}
	}
}

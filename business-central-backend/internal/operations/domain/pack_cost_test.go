package domain

import "testing"

func TestSplitPackCostPreservesCents(t *testing.T) {
	for _, test := range []struct{ cents, units int64 }{{1000, 30}, {9000, 30}, {1, 30}, {0, 30}, {101, 3}} {
		higherCount, higherCost, lowerCount, lowerCost, err := SplitPackCost(test.cents, test.units)
		if err != nil {
			t.Fatal(err)
		}
		if higherCount+lowerCount != test.units || higherCount*higherCost+lowerCount*lowerCost != test.cents {
			t.Fatalf("split lost value for %d cents over %d units", test.cents, test.units)
		}
	}
}

func TestSplitPackCostRejectsInvalidInputs(t *testing.T) {
	if _, _, _, _, err := SplitPackCost(-1, 30); err == nil {
		t.Fatal("negative cost accepted")
	}
	if _, _, _, _, err := SplitPackCost(100, 0); err == nil {
		t.Fatal("zero output accepted")
	}
}

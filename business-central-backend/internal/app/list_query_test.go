package app

import "testing"

func TestNewListQueryNormalizesCollectionParameters(t *testing.T) {
	query := NewListQuery(" coffee ", "status:OPEN,is_active=true", ParsePageIndex("", "3"), ParsePageSize("10"))
	if query.Search != "coffee" || query.PageIndex != 2 || query.PageSize != 10 {
		t.Fatalf("unexpected query normalization: %+v", query)
	}
	if query.Filter("status") != "OPEN" || query.Filter("is_active") != "true" {
		t.Fatalf("unexpected filters: %+v", query.Filters)
	}
}

func TestParsePageSizeDefaultsToTen(t *testing.T) {
	if ParsePageSize("") != 10 || ParsePageSize("0") != 10 || ParsePageSize("101") != 10 {
		t.Fatalf("expected invalid page sizes to default to 10")
	}
}

func TestPaginateUsesZeroBasedPageIndex(t *testing.T) {
	query := NewListQuery("", "", 1, 2)
	result := Paginate([]string{"a", "b", "c", "d", "e"}, query, nil)
	if len(result.Data) != 2 || result.Data[0] != "c" || result.Data[1] != "d" {
		t.Fatalf("unexpected page data: %+v", result.Data)
	}
	if result.Meta.Total != 5 || result.Meta.TotalPages != 3 || result.Meta.PageIndex != 1 {
		t.Fatalf("unexpected page metadata: %+v", result.Meta)
	}
}

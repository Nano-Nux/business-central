package dto

import "time"

type SalesSummary struct {
	From            *time.Time `json:"from,omitempty"`
	To              *time.Time `json:"to,omitempty"`
	OrderCount      int64      `json:"order_count"`
	POSOrderCount   int64      `json:"pos_order_count"`
	RepairCount     int64      `json:"repair_count"`
	ItemQuantity    string     `json:"item_quantity"`
	GrossSales      string     `json:"gross_sales"`
	Discounts       string     `json:"discounts"`
	Tax             string     `json:"tax"`
	NetSales        string     `json:"net_sales"`
	Refunds         string     `json:"refunds"`
	CostOfGoodsSold string     `json:"cost_of_goods_sold"`
	GrossProfit     string     `json:"gross_profit"`
	GrossMargin     string     `json:"gross_margin_percent"`
}

type SalesByDay struct {
	Day             time.Time `json:"day"`
	OrderCount      int64     `json:"order_count"`
	ItemQuantity    string    `json:"item_quantity"`
	NetSales        string    `json:"net_sales"`
	Refunds         string    `json:"refunds"`
	CostOfGoodsSold string    `json:"cost_of_goods_sold"`
	GrossProfit     string    `json:"gross_profit"`
}

type TopProduct struct {
	ProductID       string `json:"product_id"`
	VariantID       string `json:"variant_id"`
	ProductName     string `json:"product_name"`
	VariantName     string `json:"variant_name"`
	SKU             string `json:"sku"`
	ItemQuantity    string `json:"item_quantity"`
	NetSales        string `json:"net_sales"`
	CostOfGoodsSold string `json:"cost_of_goods_sold"`
	GrossProfit     string `json:"gross_profit"`
}

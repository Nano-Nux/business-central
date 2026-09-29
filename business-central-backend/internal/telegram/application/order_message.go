package application

import (
	"fmt"
	"strings"

	tdto "business-central-backend/internal/telegram/application/dto"
)

func orderMessage(order tdto.Order) string {
	var text strings.Builder
	fmt.Fprintf(&text, "Order No: %s\nStatus: %s\n", order.OrderNumber, order.Status)
	if order.AutoConfirmed {
		text.WriteString("Automatically confirmed\n")
	}
	if order.PaymentStatus != "" {
		fmt.Fprintf(&text, "Payment: %s\n", order.PaymentStatus)
	}
	if order.CustomerName != nil {
		fmt.Fprintf(&text, "Customer: %s\n", *order.CustomerName)
	}
	text.WriteString("\n")
	for index, item := range order.Items {
		name := []rune(item.Description)
		if len(name) > 72 {
			name = append(name[:69], '.', '.', '.')
		}
		fmt.Fprintf(&text, "%d. %s\nQuantity: %s × %s %s = %s %s\n", index+1, string(name), item.Quantity, item.UnitPrice, order.CurrencyCode, item.LineTotal, order.CurrencyCode)
	}
	fmt.Fprintf(&text, "\nTotal: %s %s", order.GrandTotal, order.CurrencyCode)
	if order.Status == "DRAFT" {
		text.WriteString("\nAwaiting administrator confirmation.")
	}
	return text.String()
}

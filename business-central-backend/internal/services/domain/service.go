package domain

// Service work and repairs share the service-order lifecycle. Repair-specific
// records extend a service order and never create a second customer/order
// aggregate.
type Service struct{}

package outbound

import (
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/services/application/dto"
	"context"
)

type Repository interface {
	ListServiceCategories(context.Context, *authdto.Claims, app.ListQuery) ([]dto.ServiceCategory, int, error)
	CreateServiceCategory(context.Context, *authdto.Claims, dto.ServiceCategoryRequest) (dto.ServiceCategory, error)
	UpdateServiceCategory(context.Context, *authdto.Claims, string, dto.ServiceCategoryRequest) (dto.ServiceCategory, error)
	DeleteServiceCategory(context.Context, *authdto.Claims, string) error
	ListServiceCatalog(context.Context, *authdto.Claims, app.ListQuery) ([]dto.ServiceDefinition, int, error)
	CreateServiceCatalog(context.Context, *authdto.Claims, dto.ServiceDefinitionRequest) (dto.ServiceDefinition, error)
	UpdateServiceCatalog(context.Context, *authdto.Claims, string, dto.ServiceDefinitionRequest) (dto.ServiceDefinition, error)
	DeleteServiceCatalog(context.Context, *authdto.Claims, string) error
	ListServicePrices(context.Context, *authdto.Claims, app.ListQuery) ([]dto.ServicePrice, int, error)
	UpsertServicePrice(context.Context, *authdto.Claims, dto.ServicePriceRequest) (dto.ServicePrice, error)
	DeleteServicePrice(context.Context, *authdto.Claims, string, string) error
	ListServiceOrders(context.Context, *authdto.Claims, app.ListQuery) ([]dto.ServiceOrder, int, error)
	GetServiceOrder(context.Context, *authdto.Claims, string) (dto.ServiceOrder, error)
	CreateServiceOrder(context.Context, *authdto.Claims, dto.ServiceOrderRequest) (dto.ServiceOrder, error)
	UpdateServiceOrder(context.Context, *authdto.Claims, string, dto.ServiceOrderRequest) (dto.ServiceOrder, error)
	DeleteServiceOrder(context.Context, *authdto.Claims, string) error
	ListServiceOrderItems(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.ServiceOrderItem, int, error)
	CreateServiceOrderItem(context.Context, *authdto.Claims, dto.ServiceOrderItemRequest) (dto.ServiceOrderItem, error)
	UpdateServiceOrderItem(context.Context, *authdto.Claims, string, dto.ServiceOrderItemRequest) (dto.ServiceOrderItem, error)
	DeleteServiceOrderItem(context.Context, *authdto.Claims, string) error
	ListAppointments(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.ServiceAppointment, int, error)
	CreateAppointment(context.Context, *authdto.Claims, dto.ServiceAppointmentRequest) (dto.ServiceAppointment, error)
	UpdateAppointment(context.Context, *authdto.Claims, string, dto.ServiceAppointmentRequest) (dto.ServiceAppointment, error)
	DeleteAppointment(context.Context, *authdto.Claims, string) error
	ListNotes(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.ServiceNote, int, error)
	CreateNote(context.Context, *authdto.Claims, dto.ServiceNoteRequest) (dto.ServiceNote, error)
	DeleteNote(context.Context, *authdto.Claims, string) error
	ListBillings(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.ServiceBilling, int, error)
	CreateBilling(context.Context, *authdto.Claims, dto.ServiceBillingRequest) (dto.ServiceBilling, error)
	UpdateBilling(context.Context, *authdto.Claims, string, dto.ServiceBillingRequest) (dto.ServiceBilling, error)
	DeleteBilling(context.Context, *authdto.Claims, string) error
	ListCustomFieldDefinitions(context.Context, *authdto.Claims, app.ListQuery) ([]dto.CustomFieldDefinition, int, error)
	CreateCustomFieldDefinition(context.Context, *authdto.Claims, dto.CustomFieldDefinitionRequest) (dto.CustomFieldDefinition, error)
	UpdateCustomFieldDefinition(context.Context, *authdto.Claims, string, dto.CustomFieldDefinitionRequest) (dto.CustomFieldDefinition, error)
	DeleteCustomFieldDefinition(context.Context, *authdto.Claims, string) error
	ListCustomFieldValues(context.Context, *authdto.Claims, string, string, app.ListQuery) ([]dto.CustomFieldValue, int, error)
	UpsertCustomFieldValue(context.Context, *authdto.Claims, string, string, dto.CustomFieldValueRequest) (dto.CustomFieldValue, error)
	DeleteCustomFieldValue(context.Context, *authdto.Claims, string) error
	ListRepairDevices(context.Context, *authdto.Claims, app.ListQuery) ([]dto.RepairDevice, int, error)
	CreateRepairDevice(context.Context, *authdto.Claims, dto.RepairDeviceRequest) (dto.RepairDevice, error)
	UpdateRepairDevice(context.Context, *authdto.Claims, string, dto.RepairDeviceRequest) (dto.RepairDevice, error)
	DeleteRepairDevice(context.Context, *authdto.Claims, string) error
	ListRepairPresets(context.Context, *authdto.Claims, string, string, app.ListQuery) ([]dto.RepairPreset, int, error)
	CreateRepairPreset(context.Context, *authdto.Claims, dto.RepairPresetRequest) (dto.RepairPreset, error)
	UpdateRepairPreset(context.Context, *authdto.Claims, string, dto.RepairPresetRequest) (dto.RepairPreset, error)
	DeleteRepairPreset(context.Context, *authdto.Claims, string) error
	ListRepairOrders(context.Context, *authdto.Claims, app.ListQuery) ([]dto.RepairOrder, int, error)
	ListRepairWorkItems(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.RepairWorkItem, int, error)
	UpdateRepairWorkItem(context.Context, *authdto.Claims, string, dto.RepairWorkItemUpdateRequest) (dto.RepairWorkItem, error)
	GetRepairOrder(context.Context, *authdto.Claims, string) (dto.RepairOrder, error)
	CreateRepairOrder(context.Context, *authdto.Claims, dto.RepairOrderRequest) (dto.RepairOrder, error)
	CreateRepairTicket(context.Context, *authdto.Claims, dto.CreateRepairTicketRequest) (dto.RepairTicket, error)
	UpdateRepairOrder(context.Context, *authdto.Claims, string, dto.RepairOrderRequest) (dto.RepairOrder, error)
	UpdateRepairTicketDetails(context.Context, *authdto.Claims, string, dto.RepairTicketDetailsRequest) (dto.RepairOrder, error)
	UpdateRepairTicketBilling(context.Context, *authdto.Claims, string, dto.RepairTicketBillingRequest) (dto.RepairOrder, error)
	DeleteRepairOrder(context.Context, *authdto.Claims, string) error
	ListRepairPayments(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.RepairPayment, int, error)
	CreateRepairPayment(context.Context, *authdto.Claims, string, dto.RepairPaymentRequest) (dto.RepairPayment, error)
	ListRepairRefunds(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.RepairRefund, int, error)
	CreateRepairRefund(context.Context, *authdto.Claims, string, dto.RepairRefundRequest) (dto.RepairRefund, error)
	ListRepairImages(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.RepairImage, int, error)
	CreateRepairImage(context.Context, *authdto.Claims, string, dto.RepairImageRequest) (dto.RepairImage, error)
	DeleteRepairImage(context.Context, *authdto.Claims, string) error
	ListDiagnostics(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.RepairDiagnostic, int, error)
	CreateDiagnostic(context.Context, *authdto.Claims, dto.RepairDiagnosticRequest) (dto.RepairDiagnostic, error)
	UpdateDiagnostic(context.Context, *authdto.Claims, string, dto.RepairDiagnosticRequest) (dto.RepairDiagnostic, error)
	DeleteDiagnostic(context.Context, *authdto.Claims, string) error
	ListRepairParts(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.RepairPart, int, error)
	CreateRepairPart(context.Context, *authdto.Claims, dto.RepairPartRequest) (dto.RepairPart, error)
	UpdateRepairPart(context.Context, *authdto.Claims, string, dto.RepairPartRequest) (dto.RepairPart, error)
	DeleteRepairPart(context.Context, *authdto.Claims, string) error
	ListApprovals(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.RepairApproval, int, error)
	CreateApproval(context.Context, *authdto.Claims, dto.RepairApprovalRequest) (dto.RepairApproval, error)
	UpdateApproval(context.Context, *authdto.Claims, string, dto.RepairApprovalRequest) (dto.RepairApproval, error)
	DeleteApproval(context.Context, *authdto.Claims, string) error
	ListWarranties(context.Context, *authdto.Claims, string, app.ListQuery) ([]dto.RepairWarranty, int, error)
	CreateWarranty(context.Context, *authdto.Claims, dto.RepairWarrantyRequest) (dto.RepairWarranty, error)
	UpdateWarranty(context.Context, *authdto.Claims, string, dto.RepairWarrantyRequest) (dto.RepairWarranty, error)
	DeleteWarranty(context.Context, *authdto.Claims, string) error
}

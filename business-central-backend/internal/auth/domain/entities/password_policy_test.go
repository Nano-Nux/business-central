package entities

import (
	"errors"
	"testing"
)

func TestCanActorChangeTargetPassword(t *testing.T) {
	tests := []struct {
		name        string
		actor       PasswordChangeActor
		target      PasswordChangeTarget
		expectedErr error
	}{
		{
			name:        "Merchant can change own password",
			actor:       PasswordChangeActor{IsMerchant: true},
			target:      PasswordChangeTarget{IsSelf: true},
			expectedErr: nil,
		},
		{
			name:        "Merchant can change staff password",
			actor:       PasswordChangeActor{IsMerchant: true},
			target:      PasswordChangeTarget{IsStaff: true, IsSelf: false},
			expectedErr: nil,
		},
		{
			name:        "Staff cannot change own password",
			actor:       PasswordChangeActor{IsMerchant: false},
			target:      PasswordChangeTarget{IsSelf: true},
			expectedErr: ErrStaffCannotChangePassword,
		},
		{
			name:        "Staff cannot change other staff password",
			actor:       PasswordChangeActor{IsMerchant: false},
			target:      PasswordChangeTarget{IsStaff: true, IsSelf: false},
			expectedErr: ErrStaffCannotChangeOtherPass,
		},
		{
			name:        "Admin can change own password",
			actor:       PasswordChangeActor{IsAdmin: true},
			target:      PasswordChangeTarget{IsSelf: true},
			expectedErr: nil,
		},
		{
			name:        "Admin can change merchant password",
			actor:       PasswordChangeActor{IsAdmin: true},
			target:      PasswordChangeTarget{IsSelf: false},
			expectedErr: nil,
		},
		{
			name:        "Admin can change staff password",
			actor:       PasswordChangeActor{IsAdmin: true},
			target:      PasswordChangeTarget{IsStaff: true, IsSelf: false},
			expectedErr: nil,
		},
		{
			name:        "Admin cannot change other admin password",
			actor:       PasswordChangeActor{IsAdmin: true},
			target:      PasswordChangeTarget{IsAdmin: true, IsSelf: false},
			expectedErr: ErrAdminPasswordProtected,
		},
		{
			name:        "Admin cannot change super-admin password",
			actor:       PasswordChangeActor{IsAdmin: true},
			target:      PasswordChangeTarget{IsSuperAdmin: true, IsSelf: false},
			expectedErr: ErrSuperAdminPasswordProtected,
		},
		{
			name:        "Super-admin can change any admin password",
			actor:       PasswordChangeActor{IsSuperAdmin: true, IsAdmin: true},
			target:      PasswordChangeTarget{IsAdmin: true, IsSelf: false},
			expectedErr: nil,
		},
		{
			name:        "Super-admin can change merchant and staff passwords",
			actor:       PasswordChangeActor{IsSuperAdmin: true, IsAdmin: true},
			target:      PasswordChangeTarget{IsStaff: true, IsSelf: false},
			expectedErr: nil,
		},
		{
			name:        "Super-admin can change own password",
			actor:       PasswordChangeActor{IsSuperAdmin: true, IsAdmin: true},
			target:      PasswordChangeTarget{IsSuperAdmin: true, IsSelf: true},
			expectedErr: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CanActorChangeTargetPassword(tt.actor, tt.target)
			if !errors.Is(err, tt.expectedErr) {
				t.Fatalf("expected error %v, got %v", tt.expectedErr, err)
			}
		})
	}
}

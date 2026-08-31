package entities

import "errors"

var (
	ErrSuperAdminPasswordProtected = errors.New("administrators cannot change a super administrator password")
	ErrAdminPasswordProtected      = errors.New("administrators cannot change another administrator password")
	ErrStaffCannotChangePassword   = errors.New("staff cannot change their own password; please contact your merchant administrator")
	ErrStaffCannotChangeOtherPass  = errors.New("only merchants can change staff passwords")
)

type PasswordChangeActor struct {
	IsSuperAdmin bool
	IsAdmin      bool
	IsMerchant   bool
	IdentityID   string
}

type PasswordChangeTarget struct {
	IsSuperAdmin bool
	IsAdmin      bool
	IsStaff      bool
	IdentityID   string
	IsSelf       bool
}

// CanActorChangeTargetPassword evaluates whether the actor is authorized to change the target's password
func CanActorChangeTargetPassword(actor PasswordChangeActor, target PasswordChangeTarget) error {
	// Super-admin can change anyone's password (including own and other admins)
	if actor.IsSuperAdmin {
		return nil
	}

	// Platform Admin (non-super)
	if actor.IsAdmin {
		if target.IsSelf {
			return nil
		}
		if target.IsSuperAdmin {
			return ErrSuperAdminPasswordProtected
		}
		if target.IsAdmin {
			return ErrAdminPasswordProtected
		}
		// Can change merchant and staff passwords
		return nil
	}

	// Merchant Owner context
	if actor.IsMerchant {
		if target.IsSelf {
			return nil
		}
		if target.IsSuperAdmin || target.IsAdmin {
			return ErrStaffCannotChangeOtherPass
		}
		// Merchant can change staff password
		return nil
	}

	// Staff context
	if target.IsSelf {
		return ErrStaffCannotChangePassword
	}
	return ErrStaffCannotChangeOtherPass
}

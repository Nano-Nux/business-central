import '../../auth/data/online_auth_api.dart';
import '../application/staff_repository.dart';

class OnlineStaffRepository implements StaffRepository {
  OnlineStaffRepository(this.api);
  final OnlineAuthApi api;

  @override
  Future<List<OnlineUser>> listUsers() => api.listUsers();

  @override
  Future<List<OnlineRole>> listRoles() => api.listRoles();

  @override
  Future<OnlineUser> create({
    required String email,
    required String password,
    required String displayName,
    String? phone,
    String? roleCode,
    String? shopId,
  }) => api.createUser({
    'email': email.trim(),
    'password': password,
    'display_name': displayName.trim(),
    if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
    if (roleCode != null && roleCode.trim().isNotEmpty)
      'role_code': roleCode.trim(),
    if (shopId != null && shopId.trim().isNotEmpty) 'shop_id': shopId.trim(),
  });

  @override
  Future<OnlineUser> update(
    String id, {
    String? displayName,
    String? phone,
    String? password,
    bool? isActive,
    String? roleId,
    String? shopId,
  }) => api.updateUser(id, {
    if (displayName != null) 'display_name': displayName.trim(),
    if (phone != null) 'phone': phone.trim(),
    if (password != null && password.isNotEmpty) 'password': password,
    'is_active': isActive,
    if (roleId != null && roleId.trim().isNotEmpty) 'role_ids': [roleId],
    if (shopId?.trim().isNotEmpty ?? false) 'shop_id': shopId,
  });

  @override
  Future<void> delete(String id) => api.deleteUser(id);
}

import '../../auth/data/online_auth_api.dart';

abstract interface class StaffRepository {
  Future<List<OnlineUser>> listUsers();
  Future<List<OnlineRole>> listRoles();
  Future<OnlineUser> create({
    required String email,
    required String password,
    required String displayName,
    String? phone,
    String? roleCode,
    String? shopId,
  });
  Future<OnlineUser> update(
    String id, {
    String? displayName,
    String? phone,
    String? password,
    bool? isActive,
    String? roleId,
    String? shopId,
  });
  Future<void> delete(String id);
}

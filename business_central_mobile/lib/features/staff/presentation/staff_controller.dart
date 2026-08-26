import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/data/online_auth_api.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../application/staff_repository.dart';
import '../data/local_authorization_repository.dart';
import '../data/local_staff_repository.dart';
import '../data/online_staff_repository.dart';

final staffRepositoryProvider = Provider<StaffRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalStaffRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
      actorMembershipId: auth.membershipId,
    );
  }
  return OnlineStaffRepository(ref.watch(onlineAuthApiProvider));
});

final staffControllerProvider =
    AsyncNotifierProvider<StaffController, List<OnlineUser>>(
      StaffController.new,
    );

final localAuthorizationRepositoryProvider =
    Provider<LocalAuthorizationRepository>((ref) {
      if (!ref.watch(configurationProvider).isFullyOffline) {
        throw StateError('Local authorization is only available offline.');
      }
      final auth = ref.watch(localAuthControllerProvider).asData?.value;
      if (auth?.merchantId == null || auth?.membershipId == null) {
        throw StateError('Local workspace is not authenticated.');
      }
      return LocalAuthorizationRepository(
        database: ref.watch(appDatabaseProvider),
        merchantId: auth!.merchantId!,
        actorMembershipId: auth.membershipId!,
      );
    });

final localAuthorizationSnapshotProvider =
    FutureProvider.autoDispose<LocalAuthorizationSnapshot>((ref) async {
      final auth = ref.watch(localAuthControllerProvider).asData?.value;
      if (auth?.shopId == null) {
        throw StateError('Local shop is not available.');
      }
      return ref
          .read(localAuthorizationRepositoryProvider)
          .snapshot(shopId: auth!.shopId!);
    });

class StaffController extends AsyncNotifier<List<OnlineUser>> {
  StaffRepository get _repository => ref.read(staffRepositoryProvider);

  @override
  Future<List<OnlineUser>> build() => _repository.listUsers();

  Future<void> refresh() async {
    state = await AsyncValue.guard(_repository.listUsers);
  }

  Future<void> create({
    required String email,
    required String password,
    required String displayName,
    String? phone,
    String? roleCode,
    String? shopId,
  }) async {
    await _repository.create(
      email: email,
      password: password,
      displayName: displayName,
      phone: phone,
      roleCode: roleCode,
      shopId: shopId,
    );
    await refresh();
  }

  Future<void> toggleActive(OnlineUser user) async {
    await _repository.update(user.membershipId, isActive: !user.isActive);
    await refresh();
  }

  Future<void> delete(String id) async {
    await _repository.delete(id);
    await refresh();
  }

  Future<void> updateLocalRolePermissions({
    required String roleId,
    required Set<String> permissionCodes,
  }) async {
    await ref
        .read(localAuthorizationRepositoryProvider)
        .updateRolePermissions(
          roleId: roleId,
          permissionCodes: permissionCodes,
        );
    ref.invalidate(localAuthorizationSnapshotProvider);
    await ref.read(localAuthControllerProvider.notifier).refreshAuthorization();
  }

  Future<void> setLocalShopModule({
    required String shopId,
    required String moduleCode,
    required bool enabled,
  }) async {
    await ref
        .read(localAuthorizationRepositoryProvider)
        .setShopModule(
          shopId: shopId,
          moduleCode: moduleCode,
          enabled: enabled,
        );
    ref.invalidate(localAuthorizationSnapshotProvider);
    await ref.read(localAuthControllerProvider.notifier).refreshAuthorization();
  }
}

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/sync/sync_queue.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../../auth/presentation/online_auth_controller.dart';
import '../../auth/presentation/workspace_controller.dart';
import '../application/settings_repository.dart';
import '../application/repair_specifications_repository.dart';
import '../data/local_settings_repository.dart';
import '../data/local_printer_repository.dart';
import '../data/local_repair_specifications_repository.dart';
import '../data/online_settings_repository.dart';
import '../domain/shop_settings_models.dart';

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    return LocalSettingsRepository(
      database: ref.watch(appDatabaseProvider),
      actorMembershipId: auth?.membershipId,
    );
  }
  final session = ref.watch(onlineAuthControllerProvider).asData?.value;
  return OnlineSettingsRepository(
    ref.watch(onlineAuthApiProvider),
    database: ref.watch(appDatabaseProvider),
    queue: SyncQueueWriter(database: ref.watch(appDatabaseProvider)),
    actorMembershipId: session?.user.membershipId,
  );
});

final settingsControllerProvider =
    AsyncNotifierProvider<SettingsController, ShopSettings>(
      SettingsController.new,
    );

final printerProfilesProvider = FutureProvider.autoDispose
    .family<
      List<LocalPrinterProfileRecord>,
      ({String merchantId, String shopId})
    >((ref, scope) async {
      final configuration = ref.watch(configurationProvider);
      final actorMembershipId = configuration.isFullyOffline
          ? ref.watch(localAuthControllerProvider).asData?.value.membershipId
          : ref
                .watch(onlineAuthControllerProvider)
                .asData
                ?.value
                ?.user
                .membershipId;
      return LocalPrinterRepository(
        database: ref.watch(appDatabaseProvider),
        merchantId: scope.merchantId,
        actorMembershipId: actorMembershipId,
      ).list(shopId: scope.shopId);
    });

final repairSpecificationsRepositoryProvider =
    Provider<RepairSpecificationsRepository>((ref) {
      final configuration = ref.watch(configurationProvider);
      final actorMembershipId = configuration.isFullyOffline
          ? ref.watch(localAuthControllerProvider).asData?.value.membershipId
          : ref
                .watch(onlineAuthControllerProvider)
                .asData
                ?.value
                ?.user
                .membershipId;
      return LocalRepairSpecificationsRepository(
        database: ref.watch(appDatabaseProvider),
        actorMembershipId: actorMembershipId,
      );
    });

final repairSpecificationsControllerProvider =
    AsyncNotifierProvider<RepairSpecificationsController, RepairSpecifications>(
      RepairSpecificationsController.new,
    );

class SettingsController extends AsyncNotifier<ShopSettings> {
  @override
  Future<ShopSettings> build() async {
    final scope = _scope();
    return ref
        .read(settingsRepositoryProvider)
        .load(merchantId: scope.$1, shopId: scope.$2);
  }

  Future<void> saveSettings({
    required String name,
    required String code,
    required String timezone,
    bool? includeTax,
    String? taxRate,
    String? taxLabel,
    String? receiptNote,
    String? footerNote,
  }) async {
    final scope = _scope();
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref
          .read(settingsRepositoryProvider)
          .update(
            merchantId: scope.$1,
            shopId: scope.$2,
            name: name,
            code: code,
            timezone: timezone,
            includeTax: includeTax,
            taxRate: taxRate,
            taxLabel: taxLabel,
            receiptNote: receiptNote,
            footerNote: footerNote,
          ),
    );
  }

  Future<LocalPrinterProfileRecord> savePrinterProfile({
    String? id,
    required String name,
    required LocalPrinterConnectionType connectionType,
    String? deviceAddress,
    String? networkHost,
    int networkPort = 9100,
    int paperWidthMm = 80,
    int fontScalePercent = 100,
    bool isDefault = false,
  }) async {
    final scope = _scope();
    final configuration = ref.read(configurationProvider);
    final actorMembershipId = configuration.isFullyOffline
        ? ref.read(localAuthControllerProvider).asData?.value.membershipId
        : ref
              .read(onlineAuthControllerProvider)
              .asData
              ?.value
              ?.user
              .membershipId;
    final profile =
        await LocalPrinterRepository(
          database: ref.read(appDatabaseProvider),
          merchantId: scope.$1,
          actorMembershipId: actorMembershipId,
        ).save(
          id: id,
          shopId: scope.$2,
          name: name,
          connectionType: connectionType,
          deviceAddress: deviceAddress,
          networkHost: networkHost,
          networkPort: networkPort,
          paperWidthMm: paperWidthMm,
          fontScalePercent: fontScalePercent,
          isDefault: isDefault,
        );
    ref.invalidate(
      printerProfilesProvider((merchantId: scope.$1, shopId: scope.$2)),
    );
    return profile;
  }

  Future<void> deletePrinterProfile(String id) async {
    final scope = _scope();
    final configuration = ref.read(configurationProvider);
    final actorMembershipId = configuration.isFullyOffline
        ? ref.read(localAuthControllerProvider).asData?.value.membershipId
        : ref
              .read(onlineAuthControllerProvider)
              .asData
              ?.value
              ?.user
              .membershipId;
    await LocalPrinterRepository(
      database: ref.read(appDatabaseProvider),
      merchantId: scope.$1,
      actorMembershipId: actorMembershipId,
    ).delete(shopId: scope.$2, id: id);
    ref.invalidate(
      printerProfilesProvider((merchantId: scope.$1, shopId: scope.$2)),
    );
  }

  (String, String) _scope() {
    if (ref.read(configurationProvider).isFullyOffline) {
      final auth = ref.read(localAuthControllerProvider).asData?.value;
      if (auth?.merchantId == null || auth?.shopId == null) {
        throw StateError('Local workspace is not ready.');
      }
      return (auth!.merchantId!, auth.shopId!);
    }
    final workspace = ref.read(onlineWorkspaceControllerProvider).asData?.value;
    if (workspace == null) throw StateError('Workspace is not ready.');
    return (workspace.merchant.id, workspace.selectedShop.id);
  }
}

class RepairSpecificationsController
    extends AsyncNotifier<RepairSpecifications> {
  @override
  Future<RepairSpecifications> build() async {
    final scope = _scope();
    return ref
        .read(repairSpecificationsRepositoryProvider)
        .load(merchantId: scope.$1, shopId: scope.$2);
  }

  Future<void> save({
    required String faultPresets,
    required String defaultDuration,
  }) async {
    final scope = _scope();
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref
          .read(repairSpecificationsRepositoryProvider)
          .save(
            merchantId: scope.$1,
            shopId: scope.$2,
            faultPresets: faultPresets.split(','),
            defaultDuration: defaultDuration,
          ),
    );
  }

  (String, String) _scope() {
    if (ref.read(configurationProvider).isFullyOffline) {
      final auth = ref.read(localAuthControllerProvider).asData?.value;
      if (auth?.merchantId == null || auth?.shopId == null) {
        throw StateError('Local workspace is not ready.');
      }
      return (auth!.merchantId!, auth.shopId!);
    }
    final workspace = ref.read(onlineWorkspaceControllerProvider).asData?.value;
    if (workspace == null) throw StateError('Workspace is not ready.');
    return (workspace.merchant.id, workspace.selectedShop.id);
  }
}

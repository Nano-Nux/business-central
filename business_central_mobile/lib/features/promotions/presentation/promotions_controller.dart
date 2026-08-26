import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../auth/presentation/local_auth_controller.dart';
import '../application/promotions_repository.dart';
import '../data/local_promotions_repository.dart';
import '../data/online_promotions_repository.dart';
import '../domain/promotion_models.dart';

final promotionsRepositoryProvider = Provider<PromotionsRepository>((ref) {
  if (ref.watch(configurationProvider).isFullyOffline) {
    final auth = ref.watch(localAuthControllerProvider).asData?.value;
    if (auth?.merchantId == null) {
      throw StateError('Local workspace is not authenticated.');
    }
    return LocalPromotionsRepository(
      database: ref.watch(appDatabaseProvider),
      merchantId: auth!.merchantId!,
      actorMembershipId: auth.membershipId,
    );
  }
  return OnlinePromotionsRepository(ref.watch(onlineAuthApiProvider));
});

final promotionsControllerProvider =
    AsyncNotifierProvider<PromotionsController, List<PromotionRecord>>(
      PromotionsController.new,
    );

class PromotionsController extends AsyncNotifier<List<PromotionRecord>> {
  @override
  Future<List<PromotionRecord>> build() => _load();

  Future<void> create({
    required String name,
    required String promotionType,
    required String value,
    String? minimumSubtotal,
    int? usageLimit,
    DateTime? startsAt,
    DateTime? endsAt,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref
          .read(promotionsRepositoryProvider)
          .create(
            name: name,
            promotionType: promotionType,
            value: value,
            minimumSubtotal: minimumSubtotal,
            usageLimit: usageLimit,
            startsAt: startsAt,
            endsAt: endsAt,
          );
      return _load();
    });
  }

  Future<void> remove(String id) async {
    final current = state.asData?.value;
    if (current == null) return;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await ref.read(promotionsRepositoryProvider).delete(id);
      return [
        for (final item in current)
          if (item.id != id) item,
      ];
    });
  }

  Future<List<PromotionRecord>> _load() =>
      ref.read(promotionsRepositoryProvider).list();
}

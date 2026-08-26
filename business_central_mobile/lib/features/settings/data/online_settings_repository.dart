import 'package:dio/dio.dart';

import '../../../core/database/app_database.dart';
import '../../../core/network/network_boundary.dart';
import '../../../core/sync/sync_queue.dart';
import '../../../features/auth/data/online_auth_api.dart';
import '../application/settings_repository.dart';
import 'local_settings_repository.dart';
import '../domain/shop_settings_models.dart';

class OnlineSettingsRepository implements SettingsRepository {
  OnlineSettingsRepository(
    this.api, {
    AppDatabase? database,
    this.queue,
    String? actorMembershipId,
  }) : _local = database == null
           ? null
           : LocalSettingsRepository(
               database: database,
               actorMembershipId: actorMembershipId,
             );
  final OnlineAuthApi api;
  final LocalSettingsRepository? _local;
  final SyncQueueWriter? queue;

  @override
  Future<ShopSettings> load({
    required String merchantId,
    required String shopId,
  }) async {
    try {
      final value = ShopSettings.fromJson(
        await api.getResource('/shops/$shopId'),
        merchantId: merchantId,
        shopId: shopId,
      );
      await _local?.cacheFromServer(value);
      return value;
    } on Object catch (error) {
      if (_isTransportFailure(error)) {
        final local = _local;
        if (local != null) {
          return local.load(merchantId: merchantId, shopId: shopId);
        }
      }
      rethrow;
    }
  }

  @override
  Future<ShopSettings> update({
    required String merchantId,
    required String shopId,
    required String name,
    required String code,
    required String timezone,
    bool? includeTax,
    String? taxRate,
    String? taxLabel,
    String? receiptNote,
    String? footerNote,
  }) async {
    try {
      final value = ShopSettings.fromJson(
        await api.patchResource('/shops/$shopId', {
          'name': name.trim(),
          'code': code.trim(),
          'timezone': timezone.trim(),
          'include_tax': includeTax,
          if (taxRate?.trim() case final value? when value.isNotEmpty)
            'tax_rate': value,
          if (taxLabel != null) 'tax_label': taxLabel.trim(),
          if (receiptNote != null) 'receipt_note': receiptNote.trim(),
          if (footerNote != null) 'footer_note': footerNote.trim(),
        }),
        merchantId: merchantId,
        shopId: shopId,
      );
      await _local?.cacheFromServer(value);
      return value;
    } on Object catch (error) {
      if (!_isTransportFailure(error)) rethrow;
      final local = _local;
      final writer = queue;
      if (local == null || writer == null) rethrow;
      return local.updateAndQueue(
        merchantId: merchantId,
        shopId: shopId,
        name: name,
        code: code,
        timezone: timezone,
        includeTax: includeTax,
        taxRate: taxRate,
        taxLabel: taxLabel,
        receiptNote: receiptNote,
        footerNote: footerNote,
        queue: writer,
      );
    }
  }

  bool _isTransportFailure(Object error) =>
      error is NetworkDeniedException || error is DioException;
}

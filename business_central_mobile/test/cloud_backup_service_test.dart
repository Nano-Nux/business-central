import 'dart:convert';

import 'package:business_central_mobile/core/backup/cloud_backup_service.dart';
import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/database/local_backup_service.dart';
import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late AppDatabase database;
  late Dio dio;

  setUp(() async {
    database = AppDatabase(executor: NativeDatabase.memory());
    dio = Dio();

    // Populate a test merchant and shop
    await database
        .into(database.merchants)
        .insert(
          MerchantsCompanion.insert(
            id: 'm1',
            name: 'Test Merchant',
            slug: 'test-merchant',
            currencyCode: 'USD',
            createdAt: '2026-09-17T00:00:00Z',
          ),
        );
    await database
        .into(database.shops)
        .insert(
          ShopsCompanion.insert(
            id: 's1',
            merchantId: 'm1',
            name: 'Main Shop',
            code: 'MAIN',
            createdAt: '2026-09-17T00:00:00Z',
          ),
        );
  });

  tearDown(() async {
    await database.close();
  });

  test(
    'uploadBackup sends exported merchant data with checksum and device id',
    () async {
      RequestOptions? capturedOptions;

      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            capturedOptions = options;
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 201,
                data: {'backup_id': 'bk-123', 'status': 'UPLOADED'},
              ),
            );
          },
        ),
      );

      final service = CloudBackupService(
        database: database,
        baseUri: Uri.parse('https://api.example.com/api/v1'),
        dio: dio,
      );

      final res = await service.uploadBackup(
        merchantId: 'm1',
        deviceId: 'device-abc',
        authToken: 'token-xyz',
      );

      expect(res['backup_id'], 'bk-123');
      expect(capturedOptions, isNotNull);
      expect(
        capturedOptions!.path,
        'https://api.example.com/api/v1/merchants/m1/backups',
      );
      expect(capturedOptions!.headers['Authorization'], 'Bearer token-xyz');
      expect(capturedOptions!.headers['X-Device-ID'], 'device-abc');
      expect(capturedOptions!.headers['X-Backup-Checksum'], isNotNull);
      expect(capturedOptions!.data, isA<FormData>());
    },
  );

  test(
    'restoreLatestBackup downloads and restores into local database',
    () async {
      // Generate valid backup payload using LocalBackupService
      final localBackup = LocalBackupService(database);
      final validPayload = await localBackup.exportMerchant(merchantId: 'm1');
      final payloadBytes = utf8.encode(validPayload);
      final checksum = sha256.convert(payloadBytes).toString();

      // Now delete shops to test restoration
      await database.delete(database.shops).go();
      expect(await database.select(database.shops).get(), isEmpty);

      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            if (options.path.endsWith('/latest')) {
              return handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {
                    'backup_id': 'bk-latest-99',
                    'merchant_id': 'm1',
                    'checksum': checksum,
                    'file_name': 'backup.json',
                    'file_size': payloadBytes.length,
                  },
                ),
              );
            } else if (options.path.contains('/download')) {
              return handler.resolve(
                Response<List<int>>(
                  requestOptions: options,
                  statusCode: 200,
                  data: payloadBytes,
                ),
              );
            }
            return handler.next(options);
          },
        ),
      );

      final service = CloudBackupService(
        database: database,
        baseUri: Uri.parse('https://api.example.com/api/v1'),
        dio: dio,
      );

      final restored = await service.restoreLatestBackup(
        merchantId: 'm1',
        authToken: 'token-xyz',
      );

      expect(restored, isTrue);

      // Verify merchant and shop were restored
      final merchant = await (database.select(
        database.merchants,
      )..where((t) => t.id.equals('m1'))).getSingle();
      expect(merchant.name, 'Test Merchant');
      expect(merchant.currencyCode, 'USD');

      final shops = await (database.select(
        database.shops,
      )..where((t) => t.merchantId.equals('m1'))).get();
      expect(shops.any((s) => s.code == 'MAIN'), isTrue);
    },
  );
}

import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';

import '../database/app_database.dart';
import '../database/local_backup_service.dart';

class CloudBackupService {
  CloudBackupService({required this.database, required this.baseUri, Dio? dio})
    : _dio = dio ?? Dio();

  final AppDatabase database;
  final Uri baseUri;
  final Dio _dio;

  String get _normalizedBaseUrl =>
      baseUri.toString().replaceFirst(RegExp(r'/$'), '');

  Future<Map<String, dynamic>> uploadBackup({
    required String merchantId,
    required String deviceId,
    required String authToken,
  }) async {
    final localBackup = LocalBackupService(database);
    final payloadJson = await localBackup.exportMerchant(
      merchantId: merchantId,
    );
    final bytes = utf8.encode(payloadJson);
    final checksum = sha256.convert(bytes).toString();

    final timestamp = DateTime.now().toUtc().toIso8601String().replaceAll(
      RegExp(r'[:.-]'),
      '_',
    );
    final filename = 'backup_${merchantId}_$timestamp.json';

    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: filename),
    });

    final response = await _dio.post<Map<String, dynamic>>(
      '$_normalizedBaseUrl/merchants/$merchantId/backups',
      data: formData,
      options: Options(
        headers: {
          'Authorization': 'Bearer $authToken',
          'X-Device-ID': deviceId,
          'X-Backup-Checksum': checksum,
        },
      ),
    );

    return response.data ?? {};
  }

  Future<Map<String, dynamic>?> getLatestBackupMetadata({
    required String merchantId,
    required String authToken,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_normalizedBaseUrl/merchants/$merchantId/backups/latest',
        options: Options(headers: {'Authorization': 'Bearer $authToken'}),
      );
      return response.data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<bool> restoreLatestBackup({
    required String merchantId,
    required String authToken,
  }) async {
    final meta = await getLatestBackupMetadata(
      merchantId: merchantId,
      authToken: authToken,
    );
    if (meta == null || meta['backup_id'] == null) {
      throw const LocalBackupException(
        'No cloud backups found for this merchant.',
      );
    }

    final backupId = meta['backup_id'].toString();
    final expectedChecksum = meta['checksum']?.toString();

    final downloadResponse = await _dio.get<List<int>>(
      '$_normalizedBaseUrl/merchants/$merchantId/backups/$backupId/download',
      options: Options(
        headers: {'Authorization': 'Bearer $authToken'},
        responseType: ResponseType.bytes,
      ),
    );

    final bytes = Uint8List.fromList(downloadResponse.data ?? []);
    if (expectedChecksum != null && expectedChecksum.isNotEmpty) {
      final actualChecksum = sha256.convert(bytes).toString();
      if (actualChecksum.toLowerCase() != expectedChecksum.toLowerCase()) {
        throw LocalBackupException(
          'Backup checksum mismatch: expected $expectedChecksum, got $actualChecksum',
        );
      }
    }

    final payloadJson = utf8.decode(bytes);
    final localBackup = LocalBackupService(database);
    await localBackup.restoreMerchant(
      merchantId: merchantId,
      payload: payloadJson,
    );

    return true;
  }
}

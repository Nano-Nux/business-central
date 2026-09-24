import 'dart:io';

import 'package:business_central_mobile/core/bundle/portal_bundle_manager.dart';
import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late AppDatabase database;
  late Dio dio;

  setUp(() {
    database = AppDatabase(executor: NativeDatabase.memory());
    dio = Dio();
  });

  tearDown(() async {
    await database.close();
  });

  test('persists and retrieves installed bundle version', () async {
    final manager = PortalBundleManager(
      database: database,
      baseUri: Uri.parse('https://api.example.com'),
      dio: dio,
    );

    expect(await manager.getInstalledVersion(), isNull);

    await manager.setInstalledVersion('1.2.3');
    expect(await manager.getInstalledVersion(), '1.2.3');
  });

  test('checks version and detects available updates', () async {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.path.endsWith('/portal-bundle/version')) {
            return handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'version': '2.0.0',
                  'bundle_url': 'https://api.example.com/bundle.zip',
                  'checksum': 'abc123hash',
                },
              ),
            );
          }
          return handler.next(options);
        },
      ),
    );

    final manager = PortalBundleManager(
      database: database,
      baseUri: Uri.parse('https://api.example.com'),
      dio: dio,
    );

    await manager.setInstalledVersion('1.0.0');
    expect(await manager.isUpdateAvailable(), isTrue);

    await manager.setInstalledVersion('2.0.0');
    expect(await manager.isUpdateAvailable(), isFalse);
  });

  test('embedded HTTP server serves static assets and HTML fallback', () async {
    final tempDir = await Directory.systemTemp.createTemp(
      'portal_bundle_test_',
    );
    final indexFile = File('${tempDir.path}/index.html');
    await indexFile.writeAsString(
      '<!DOCTYPE html><html><body><h1>Offline Portal</h1></body></html>',
    );

    final manager = PortalBundleManager(
      database: database,
      baseUri: Uri.parse('https://api.example.com'),
      dio: dio,
    );

    try {
      final serverUrl = await manager.startLocalServer(bundleDir: tempDir);
      expect(serverUrl, startsWith('http://127.0.0.1:'));

      final httpClient = HttpClient();
      final request = await httpClient.getUrl(Uri.parse('$serverUrl/'));
      final response = await request.close();

      expect(response.statusCode, HttpStatus.ok);
      expect(response.headers.contentType?.mimeType, 'text/html');

      final body = await response.transform(SystemEncoding().decoder).join();
      expect(body, contains('Offline Portal'));
      httpClient.close();
    } finally {
      await manager.stopLocalServer();
      await tempDir.delete(recursive: true);
    }
  });
}

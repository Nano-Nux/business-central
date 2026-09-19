import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';

import '../database/app_database.dart';

class PortalBundleManager {
  PortalBundleManager({
    required this.database,
    required this.baseUri,
    Dio? dio,
  }) : _dio = dio ?? Dio();

  final AppDatabase database;
  final Uri baseUri;
  final Dio _dio;

  HttpServer? _localServer;
  int? get localServerPort => _localServer?.port;
  String? get localServerUrl =>
      _localServer != null ? 'http://127.0.0.1:${_localServer!.port}' : null;

  static const keyBundleVersion = 'bc.portal_bundle_version';

  String get _normalizedBaseUrl => baseUri.toString().replaceFirst(RegExp(r'/$'), '');

  Future<String?> getInstalledVersion() async {
    final row = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals(keyBundleVersion)))
        .getSingleOrNull();
    return row?.value;
  }

  Future<void> setInstalledVersion(String version) async {
    final now = DateTime.now().toUtc().toIso8601String();
    await database.into(database.appMetadata).insertOnConflictUpdate(
          AppMetadataCompanion.insert(key: keyBundleVersion, value: version, updatedAt: now),
        );
  }

  Future<Map<String, dynamic>?> checkVersion() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_normalizedBaseUrl/portal-bundle/version',
      );
      return response.data;
    } catch (_) {
      return null;
    }
  }

  Future<bool> isUpdateAvailable() async {
    final remote = await checkVersion();
    if (remote == null || remote['version'] == null) return false;
    final remoteVersion = remote['version'].toString();
    final localVersion = await getInstalledVersion();
    if (localVersion == null) return true;
    return remoteVersion != localVersion;
  }

  Future<String> startLocalServer({required Directory bundleDir, int port = 0}) async {
    if (_localServer != null) {
      return localServerUrl!;
    }

    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
    _localServer = server;

    server.listen((HttpRequest request) async {
      try {
        var path = request.uri.path;
        if (path.isEmpty || path == '/') {
          path = '/index.html';
        }

        final safePath = path.replaceAll('..', '');
        var targetFile = File('${bundleDir.path}$safePath');

        if (!await targetFile.exists()) {
          final htmlFallback = File('${bundleDir.path}$safePath.html');
          if (await htmlFallback.exists()) {
            targetFile = htmlFallback;
          } else {
            targetFile = File('${bundleDir.path}/index.html');
          }
        }

        if (await targetFile.exists()) {
          final ext = targetFile.path.split('.').last.toLowerCase();
          final contentType = switch (ext) {
            'html' => ContentType.html,
            'js' || 'mjs' => ContentType('application', 'javascript', charset: 'utf-8'),
            'css' => ContentType('text', 'css', charset: 'utf-8'),
            'json' => ContentType.json,
            'png' => ContentType('image', 'png'),
            'jpg' || 'jpeg' => ContentType('image', 'jpeg'),
            'svg' => ContentType('image', 'svg+xml'),
            'ico' => ContentType('image', 'x-icon'),
            'woff2' => ContentType('font', 'woff2'),
            _ => ContentType.binary,
          };
          request.response.headers.contentType = contentType;
          await request.response.addStream(targetFile.openRead());
        } else {
          request.response.statusCode = HttpStatus.notFound;
          request.response.write('Not found');
        }
      } catch (e) {
        request.response.statusCode = HttpStatus.internalServerError;
        request.response.write('Server error: $e');
      } finally {
        await request.response.close();
      }
    });

    return 'http://127.0.0.1:${server.port}';
  }

  Future<void> stopLocalServer() async {
    await _localServer?.close(force: true);
    _localServer = null;
  }
}

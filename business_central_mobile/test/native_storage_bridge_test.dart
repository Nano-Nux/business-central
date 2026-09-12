import 'dart:convert';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/webview/native_storage_bridge.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  late AppDatabase database;
  late NativeStorageBridge bridge;
  final executedScripts = <String>[];

  setUp(() {
    database = AppDatabase(executor: NativeDatabase.memory());
    bridge = NativeStorageBridge(database: database);
    executedScripts.clear();
    bridge.attachJavaScriptEvaluator(
      (script) async => executedScripts.add(script),
      database: database,
    );
  });

  tearDown(() async {
    await database.close();
  });

  test('sets and gets key-value in local SQLite via storage bridge', () async {
    // Set theme key
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-1',
          'method': 'set',
          'payload': {'key': 'bc.theme', 'value': 'visual-clean-theme'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-1'));
    expect(executedScripts.first, contains('true'));

    // Verify row was stored in AppMetadata SQLite table
    final row = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals('bc.theme')))
        .getSingleOrNull();
    expect(row?.value, 'visual-clean-theme');

    // Get theme key
    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-2',
          'method': 'get',
          'payload': {'key': 'bc.theme'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-2'));
    expect(executedScripts.first, contains('visual-clean-theme'));
  });

  test('removes key from local SQLite via storage bridge', () async {
    // Pre-insert
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-1',
          'method': 'set',
          'payload': {'key': 'bc.theme', 'value': 'default-theme'},
        }),
      ),
    );

    // Remove
    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-3',
          'method': 'remove',
          'payload': {'key': 'bc.theme'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-3'));
    expect(executedScripts.first, contains('true'));

    // Check it is gone
    final row = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals('bc.theme')))
        .getSingleOrNull();
    expect(row, isNull);
  });

  test('stores and gets both bc.theme and bc.layout independently in SQLite', () async {
    // 1. Set bc.theme
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-theme',
          'method': 'set',
          'payload': {'key': 'bc.theme', 'value': 'visual-clean-theme'},
        }),
      ),
    );

    // 2. Set bc.layout
    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-layout',
          'method': 'set',
          'payload': {'key': 'bc.layout', 'value': 'compact-layout'},
        }),
      ),
    );

    // 3. Verify both exist independently in SQLite
    final themeRow = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals('bc.theme')))
        .getSingleOrNull();
    final layoutRow = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals('bc.layout')))
        .getSingleOrNull();

    expect(themeRow?.value, 'visual-clean-theme');
    expect(layoutRow?.value, 'compact-layout');

    // 4. Get bc.layout via bridge
    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-get-layout',
          'method': 'get',
          'payload': {'key': 'bc.layout'},
        }),
      ),
    );

    expect(executedScripts, hasLength(1));
    expect(executedScripts.first, contains('req-get-layout'));
    expect(executedScripts.first, contains('compact-layout'));
  });

  test('provides bidirectional backward compatibility between canonical and legacy keys', () async {
    // 1. Set canonical bc.theme and bc.layout
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-bc-theme',
          'method': 'set',
          'payload': {'key': 'bc.theme', 'value': 'visual-clean-theme'},
        }),
      ),
    );
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-bc-layout',
          'method': 'set',
          'payload': {'key': 'bc.layout', 'value': 'compact-layout'},
        }),
      ),
    );

    // Verify both canonical and legacy companion keys exist in SQLite
    final bcThemeRow = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals('bc.theme')))
        .getSingleOrNull();
    final legacyThemeRow = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals('theme')))
        .getSingleOrNull();
    final bcLayoutRow = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals('bc.layout')))
        .getSingleOrNull();
    final legacyLayoutRow = await (database.select(database.appMetadata)
          ..where((t) => t.key.equals('layout')))
        .getSingleOrNull();

    expect(bcThemeRow?.value, 'visual-clean-theme');
    expect(legacyThemeRow?.value, 'visual-clean-theme');
    expect(bcLayoutRow?.value, 'compact-layout');
    expect(legacyLayoutRow?.value, 'compact-layout');

    // 2. Querying legacy keys via bridge returns the canonical values
    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-get-legacy-theme',
          'method': 'get',
          'payload': {'key': 'theme'},
        }),
      ),
    );
    expect(executedScripts.first, contains('visual-clean-theme'));

    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-get-legacy-layout',
          'method': 'get',
          'payload': {'key': 'layout'},
        }),
      ),
    );
    expect(executedScripts.first, contains('compact-layout'));

    // 3. Fallback when only legacy key was in SQLite (e.g. from earlier app version)
    await (database.delete(database.appMetadata)..where((t) => t.key.equals('bc.theme'))).go();
    await (database.delete(database.appMetadata)..where((t) => t.key.equals('bc.layout'))).go();

    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-fallback-theme',
          'method': 'get',
          'payload': {'key': 'bc.theme'},
        }),
      ),
    );
    expect(executedScripts.first, contains('visual-clean-theme'));

    executedScripts.clear();
    await bridge.handleMessage(
      JavaScriptMessage(
        message: jsonEncode({
          'id': 'req-fallback-layout',
          'method': 'get',
          'payload': {'key': 'bc.layout'},
        }),
      ),
    );
    expect(executedScripts.first, contains('compact-layout'));
  });
}

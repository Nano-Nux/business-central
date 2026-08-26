import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';

void main() {
  test('native SQLite opens a plain database before Drift opens', () async {
    final directory = await Directory.systemTemp.createTemp(
      'bc-encryption-test-',
    );
    final databaseFile = File(
      '${directory.path}${Platform.pathSeparator}test.sqlite',
    );
    final database = AppDatabase(
      executor: NativeDatabase(
        databaseFile,
        setup: (rawDatabase) {
          rawDatabase.execute('PRAGMA foreign_keys = ON;');
        },
      ),
    );

    await database.select(database.appMetadata).get();

    await database.close();
    final header = String.fromCharCodes(
      (await databaseFile.readAsBytes()).take(16),
    );
    expect(header, contains('SQLite format 3'));
    await directory.delete(recursive: true);
  });
}

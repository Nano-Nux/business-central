import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

QueryExecutor openDatabaseExecutor({String? encryptionKey}) {
  return DatabaseConnection.delayed(
    Future(() async {
      final directory = await getApplicationDocumentsDirectory();
      final databasePath = p.join(
        directory.path,
        'business_central_mobile.sqlite',
      );

      return NativeDatabase.createBackgroundConnection(
        File(databasePath),
        setup: (rawDatabase) =>
            rawDatabase.execute('PRAGMA foreign_keys = ON;'),
      );
    }),
  );
}

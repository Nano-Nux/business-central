import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

QueryExecutor openDatabaseExecutor({String? encryptionKey}) {
  return driftDatabase(name: 'business_central_mobile');
}

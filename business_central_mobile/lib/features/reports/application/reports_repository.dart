import '../domain/report_models.dart';

abstract interface class ReportsRepository {
  Future<ReportsSnapshot> load({
    required String shopId,
    required DateTime from,
    required DateTime to,
  });
}

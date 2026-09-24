import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/network/network_boundary.dart';
import 'package:business_central_mobile/core/security/silent_license_validator.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

class MockNetworkClient implements NetworkClient {
  MockNetworkClient({this.statusCode = 200, this.responseBody});
  int statusCode;
  Object? responseBody;
  String? lastPath;
  Map<String, String>? lastHeaders;

  @override
  Future<NetworkResponse> request({
    String method = 'GET',
    String path = '/',
    Object? body,
    Map<String, String> headers = const {},
  }) async {
    lastPath = path;
    lastHeaders = headers;
    return NetworkResponse(statusCode: statusCode, data: responseBody);
  }
}

void main() {
  late AppDatabase database;
  late MockNetworkClient networkClient;

  setUp(() {
    database = AppDatabase(executor: NativeDatabase.memory());
    networkClient = MockNetworkClient();
  });

  tearDown(() async {
    await database.close();
  });

  test('locks down when merchant status returns SUSPENDED', () async {
    networkClient.statusCode = 200;
    networkClient.responseBody = {'status': 'SUSPENDED', 'is_active': false};

    String? lockdownReason;
    final validator = SilentLicenseValidator(
      networkClient: networkClient,
      database: database,
      onLockdown: (reason) => lockdownReason = reason,
    );

    await validator.checkLicense(overrideToken: 'dummy_token');

    expect(lockdownReason, contains('suspended'));
    expect(await validator.isLocked(), isTrue);
    expect(await validator.getLockReason(), contains('suspended'));
  });

  test('locks down when backend returns 401 unauthenticated', () async {
    networkClient.statusCode = 401;
    networkClient.responseBody = {'error': 'merchant account is disabled'};

    String? lockdownReason;
    final validator = SilentLicenseValidator(
      networkClient: networkClient,
      database: database,
      onLockdown: (reason) => lockdownReason = reason,
    );

    await validator.checkLicense(overrideToken: 'dummy_token');

    expect(lockdownReason, isNotNull);
    expect(await validator.isLocked(), isTrue);
  });

  test('unlocks when merchant status returns ACTIVE', () async {
    networkClient.statusCode = 200;
    networkClient.responseBody = {'status': 'ACTIVE', 'is_active': true};

    final validator = SilentLicenseValidator(
      networkClient: networkClient,
      database: database,
    );

    // Pre-lock
    await validator.lock('Temporary lock');
    expect(await validator.isLocked(), isTrue);

    // Check license when active
    await validator.checkLicense(overrideToken: 'dummy_token');
    expect(await validator.isLocked(), isFalse);
  });
}

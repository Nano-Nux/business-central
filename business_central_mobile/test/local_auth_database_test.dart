import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:business_central_mobile/core/database/app_database.dart';
import 'package:business_central_mobile/core/security/password_hasher.dart';
import 'package:business_central_mobile/features/auth/domain/local_auth_service.dart';

void main() {
  late AppDatabase database;
  late LocalAuthService auth;

  setUp(() {
    database = AppDatabase(executor: NativeDatabase.memory());
    auth = LocalAuthService(database: database);
  });

  tearDown(() => database.closeForTest());

  test('owner setup creates the local tenant graph transactionally', () async {
    final result = await auth.provisionOwner(
      email: ' Owner@Example.COM ',
      password: 'correct horse battery staple',
    );

    expect(await auth.isProvisioned(), isTrue);
    expect(result.merchantId, isNotEmpty);
    expect(
      (await database.select(database.merchants).get()).single.slug,
      startsWith('local-'),
    );
    expect(
      (await database.select(database.userIdentities).get()).single.email,
      'owner@example.com',
    );
    expect(
      (await database.select(database.userIdentities).get())
          .single
          .passwordHash,
      isNot(contains('correct horse battery staple')),
    );
    expect(
      (await database.select(database.shops).get()).single.id,
      result.shopId,
    );
    expect(
      (await database.select(database.locations).get()).single.shopId,
      result.shopId,
    );
    expect(
      (await database.select(database.syncDevices).get()).single.merchantId,
      result.merchantId,
    );
    expect(
      (await database.select(database.merchantModules).get()).map(
        (row) => row.moduleCode,
      ),
      containsAll(<String>['CORE', 'POS']),
    );
  });

  test(
    'local login normalizes email and requires the stored password',
    () async {
      final setup = await auth.provisionOwner(
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      );

      final login = await auth.login(
        email: ' OWNER@example.com ',
        password: 'correct horse battery staple',
      );
      expect(login.merchantId, setup.merchantId);
      expect(login.shopId, setup.shopId);
      await expectLater(
        auth.login(email: 'owner@example.com', password: 'wrong password'),
        throwsA(isA<LocalAuthException>()),
      );
    },
  );

  test('setup is one-time and password hashing uses a unique salt', () async {
    final hasher = PasswordHasher();
    final first = await hasher.hash('correct horse battery staple');
    final second = await hasher.hash('correct horse battery staple');
    expect(first.salt, isNot(second.salt));
    expect(
      await hasher.verify(
        password: 'correct horse battery staple',
        stored: first,
      ),
      isTrue,
    );
    expect(
      await hasher.verify(password: 'wrong password', stored: first),
      isFalse,
    );

    await auth.provisionOwner(
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    );
    await expectLater(
      auth.provisionOwner(
        email: 'second@example.com',
        password: 'correct horse battery staple',
      ),
      throwsA(isA<LocalAuthException>()),
    );
  });

  test('operation queue reads are merchant-scoped', () async {
    await database.enqueueOperation(
      operationId: 'op-a',
      merchantId: 'merchant-a',
      deviceId: 'device-a',
      entityType: 'orders',
      entityId: 'order-a',
      operationType: 'CREATE',
      payload: const {'amount': '10.00'},
      payloadHash: 'hash-a',
    );
    await database.enqueueOperation(
      operationId: 'op-b',
      merchantId: 'merchant-b',
      deviceId: 'device-b',
      entityType: 'orders',
      entityId: 'order-b',
      operationType: 'CREATE',
      payload: const {'amount': '20.00'},
      payloadHash: 'hash-b',
    );

    final rows = await database.watchPendingOperations('merchant-a').first;
    expect(rows.map((row) => row.operationId), ['op-a']);
    expect(rows.single.merchantId, 'merchant-a');
  });
}

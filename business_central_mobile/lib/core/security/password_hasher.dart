import 'dart:convert';

import 'package:cryptography/cryptography.dart';

class PasswordHash {
  const PasswordHash({required this.hash, required this.salt});
  final String hash;
  final String salt;
}

class PasswordHasher {
  PasswordHasher({Argon2id? algorithm})
    : _algorithm =
          algorithm ??
          Argon2id(
            parallelism: 1,
            memory: 19 * 1024,
            iterations: 2,
            hashLength: 32,
          );

  final Argon2id _algorithm;

  Future<PasswordHash> hash(String password) async {
    _validatePassword(password);
    final salt = List<int>.generate(
      16,
      (_) => SecureRandom.defaultRandom.nextInt(256),
      growable: false,
    );
    final derived = await _algorithm.deriveKeyFromPassword(
      password: password,
      nonce: salt,
    );
    final bytes = await derived.extractBytes();
    return PasswordHash(
      hash: base64UrlEncode(bytes),
      salt: base64UrlEncode(salt),
    );
  }

  Future<bool> verify({
    required String password,
    required PasswordHash stored,
  }) async {
    if (password.isEmpty || stored.hash.isEmpty || stored.salt.isEmpty) {
      return false;
    }
    try {
      final expected = base64Url.decode(stored.hash);
      final salt = base64Url.decode(stored.salt);
      final derived = await _algorithm.deriveKeyFromPassword(
        password: password,
        nonce: salt,
      );
      final actual = await derived.extractBytes();
      if (actual.length != expected.length) return false;
      var difference = 0;
      for (var index = 0; index < actual.length; index++) {
        difference |= actual[index] ^ expected[index];
      }
      return difference == 0;
    } on FormatException {
      return false;
    }
  }

  void _validatePassword(String password) {
    if (password.length < 12) {
      throw ArgumentError('Password must contain at least 12 characters.');
    }
  }
}

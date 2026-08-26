import 'dart:convert';
import 'dart:typed_data';

Uint8List? invoiceLogoBytes(String? value) {
  if (value == null || value.trim().isEmpty) return null;
  final match = RegExp(
    r'^data:image/[^;]+;base64,(.+)$',
    caseSensitive: false,
  ).firstMatch(value.trim());
  if (match == null) return null;
  try {
    return base64Decode(match.group(1)!);
  } on FormatException {
    return null;
  }
}

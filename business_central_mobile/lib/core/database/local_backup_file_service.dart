import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:share_plus/share_plus.dart';

class LocalBackupFileService {
  static const _backupType = XTypeGroup(
    label: 'Business Central encrypted backup',
    extensions: ['bcbackup', 'json'],
    mimeTypes: ['application/json', 'application/octet-stream'],
  );

  Future<bool> save({required String payload}) async {
    final destination = await getSaveLocation(
      acceptedTypeGroups: const [_backupType],
      suggestedName: 'business-central-backup.bcbackup',
      confirmButtonText: 'Save backup',
    );
    if (destination == null) return false;
    await _file(payload).saveTo(destination.path);
    return true;
  }

  Future<String?> open() async {
    final source = await openFile(
      acceptedTypeGroups: const [_backupType],
      confirmButtonText: 'Open backup',
    );
    return source?.readAsString();
  }

  Future<ShareResult> share({required String payload}) {
    return SharePlus.instance.share(
      ShareParams(
        title: 'Business Central encrypted backup',
        text: 'Keep this encrypted backup and its password secure.',
        files: [_file(payload)],
      ),
    );
  }

  XFile _file(String payload) => XFile.fromData(
    utf8.encode(payload),
    mimeType: 'application/octet-stream',
    name: 'business-central-backup.bcbackup',
  );
}

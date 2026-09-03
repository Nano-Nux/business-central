import 'package:file_selector/file_selector.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

typedef FilePickerFunction =
    Future<XFile?> Function({
      List<XTypeGroup> acceptedTypeGroups,
      String? initialDirectory,
      String? confirmButtonText,
    });

typedef FilesPickerFunction =
    Future<List<XFile>> Function({
      List<XTypeGroup> acceptedTypeGroups,
      String? initialDirectory,
      String? confirmButtonText,
    });

/// Bridges file selection requests from the WebView (e.g. `<input type="file">`
/// elements) to the native platform file picker on Android.
class NativeFileSelectorBridge {
  NativeFileSelectorBridge({
    this.openSingleFile = openFile,
    this.openMultipleFiles = openFiles,
  });

  final FilePickerFunction openSingleFile;
  final FilesPickerFunction openMultipleFiles;

  void attach(WebViewController controller) {
    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setOnShowFileSelector(handleFileSelector);
    }
  }

  Future<List<String>> handleFileSelector(FileSelectorParams params) async {
    try {
      final typeGroup = typeGroupFromAcceptTypes(params.acceptTypes);
      final acceptedTypeGroups =
          (typeGroup.mimeTypes?.isNotEmpty ?? false) ||
              (typeGroup.extensions?.isNotEmpty ?? false)
          ? [typeGroup]
          : const <XTypeGroup>[];

      if (params.mode == FileSelectorMode.openMultiple) {
        final files = await openMultipleFiles(
          acceptedTypeGroups: acceptedTypeGroups,
        );
        return files.map((file) => formatFileUri(file.path)).toList();
      } else {
        final file = await openSingleFile(
          acceptedTypeGroups: acceptedTypeGroups,
        );
        if (file == null) return const <String>[];
        return [formatFileUri(file.path)];
      }
    } catch (_) {
      return const <String>[];
    }
  }

  static XTypeGroup typeGroupFromAcceptTypes(List<String> acceptTypes) {
    final mimeTypes = <String>[];
    final extensions = <String>[];

    for (final item in acceptTypes) {
      final parts = item.split(',');
      for (final raw in parts) {
        final type = raw.trim().toLowerCase();
        if (type.isEmpty || type == '*/*') continue;
        if (type.startsWith('.')) {
          extensions.add(type.substring(1));
        } else if (type.contains('/')) {
          mimeTypes.add(type);
        } else {
          extensions.add(type);
        }
      }
    }

    return XTypeGroup(
      label: 'files',
      mimeTypes: mimeTypes.isNotEmpty ? mimeTypes : null,
      extensions: extensions.isNotEmpty ? extensions : null,
    );
  }

  static String formatFileUri(String path) {
    if (path.startsWith('content://') ||
        path.startsWith('file://') ||
        path.startsWith('http://') ||
        path.startsWith('https://')) {
      return path;
    }
    return Uri.file(path).toString();
  }
}

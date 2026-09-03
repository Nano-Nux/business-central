import 'package:business_central_mobile/webview/native_file_selector_bridge.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

void main() {
  group('NativeFileSelectorBridge', () {
    test('parses accept types into MIME types and extensions correctly', () {
      final group1 = NativeFileSelectorBridge.typeGroupFromAcceptTypes([
        'image/png, image/jpeg, .jpg',
        'application/pdf',
      ]);
      expect(group1.mimeTypes, ['image/png', 'image/jpeg', 'application/pdf']);
      expect(group1.extensions, ['jpg']);

      final group2 = NativeFileSelectorBridge.typeGroupFromAcceptTypes([
        '*/*',
        '',
      ]);
      expect(group2.mimeTypes, isNull);
      expect(group2.extensions, isNull);

      final group3 = NativeFileSelectorBridge.typeGroupFromAcceptTypes([
        'image/*',
        '.webp',
        'png',
      ]);
      expect(group3.mimeTypes, ['image/*']);
      expect(group3.extensions, ['webp', 'png']);
    });

    test('formats paths and URI strings correctly', () {
      expect(
        NativeFileSelectorBridge.formatFileUri(
          'content://com.android.providers.media.documents/document/image%3A123',
        ),
        'content://com.android.providers.media.documents/document/image%3A123',
      );
      expect(
        NativeFileSelectorBridge.formatFileUri('file:///path/to/image.png'),
        'file:///path/to/image.png',
      );
      expect(
        NativeFileSelectorBridge.formatFileUri(
          '/data/user/0/app/cache/photo.jpg',
        ),
        Uri.file('/data/user/0/app/cache/photo.jpg').toString(),
      );
    });

    test('handles single file selection returning formatted URI', () async {
      final bridge = NativeFileSelectorBridge(
        openSingleFile:
            ({
              List<XTypeGroup>? acceptedTypeGroups,
              String? initialDirectory,
              String? confirmButtonText,
            }) async {
              expect(acceptedTypeGroups, isNotEmpty);
              expect(acceptedTypeGroups!.first.mimeTypes, contains('image/*'));
              return XFile('/tmp/test_image.png');
            },
      );

      const params = FileSelectorParams(
        acceptTypes: ['image/*'],
        isCaptureEnabled: false,
        mode: FileSelectorMode.open,
      );

      final result = await bridge.handleFileSelector(params);
      expect(result, [Uri.file('/tmp/test_image.png').toString()]);
    });

    test(
      'handles multiple file selection returning list of formatted URIs',
      () async {
        final bridge = NativeFileSelectorBridge(
          openMultipleFiles:
              ({
                List<XTypeGroup>? acceptedTypeGroups,
                String? initialDirectory,
                String? confirmButtonText,
              }) async {
                expect(acceptedTypeGroups, isNotEmpty);
                expect(
                  acceptedTypeGroups!.first.mimeTypes,
                  contains('image/jpeg'),
                );
                return [
                  XFile('/tmp/image1.jpg'),
                  XFile('content://media/external/images/media/42'),
                ];
              },
        );

        const params = FileSelectorParams(
          acceptTypes: ['image/jpeg'],
          isCaptureEnabled: false,
          mode: FileSelectorMode.openMultiple,
        );

        final result = await bridge.handleFileSelector(params);
        expect(result, [
          Uri.file('/tmp/image1.jpg').toString(),
          'content://media/external/images/media/42',
        ]);
      },
    );

    test('handles cancellation by user returning empty list', () async {
      final bridge = NativeFileSelectorBridge(
        openSingleFile:
            ({
              List<XTypeGroup>? acceptedTypeGroups,
              String? initialDirectory,
              String? confirmButtonText,
            }) async => null,
      );

      const params = FileSelectorParams(
        acceptTypes: ['*/*'],
        isCaptureEnabled: false,
        mode: FileSelectorMode.open,
      );

      final result = await bridge.handleFileSelector(params);
      expect(result, isEmpty);
    });

    test('handles picker exceptions gracefully returning empty list', () async {
      final bridge = NativeFileSelectorBridge(
        openSingleFile:
            ({
              List<XTypeGroup>? acceptedTypeGroups,
              String? initialDirectory,
              String? confirmButtonText,
            }) async => throw Exception('Permission denied or picker failure'),
      );

      const params = FileSelectorParams(
        acceptTypes: ['image/png'],
        isCaptureEnabled: false,
        mode: FileSelectorMode.open,
      );

      final result = await bridge.handleFileSelector(params);
      expect(result, isEmpty);
    });
  });
}

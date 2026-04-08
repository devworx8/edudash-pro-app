describe('popUpload web handling', () => {
  const originalFetch = global.fetch;
  const originalPlatform = require('react-native').Platform.OS;

  const storageUploadMock = jest.fn();
  const storageFromMock = jest.fn(() => ({
    upload: storageUploadMock,
  }));

  const loadModule = () => {
    jest.resetModules();

    const reactNative = require('react-native');
    reactNative.Platform.OS = 'web';

    jest.doMock('../supabase', () => ({
      supabase: {
        auth: {
          getSession: jest.fn(),
        },
        storage: {
          from: storageFromMock,
        },
      },
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    }));

    jest.doMock('expo-image-manipulator', () => ({
      __esModule: true,
      manipulateAsync: jest.fn(),
      SaveFormat: {
        JPEG: 'jpeg',
      },
    }));

    jest.doMock('../utils/cameraRecovery', () => ({
      normalizeMediaUri: jest.fn((uri: string) => uri),
    }));

    jest.doMock('../dash-ai/imageCompression', () => ({
      compressImageForAI: jest.fn(),
    }));

    return require('../popUpload') as typeof import('../popUpload');
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const pdfBytes = new TextEncoder().encode('%PDF-1.4 web receipt');
    const fakeBlob = {
      size: pdfBytes.byteLength,
      type: 'application/pdf',
      arrayBuffer: jest.fn(async () => pdfBytes.buffer.slice(0)),
    };

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      blob: async () => fakeBlob,
    })) as unknown as typeof fetch;

    storageUploadMock.mockResolvedValue({
      data: { path: 'user-1/student-1/stored-receipt.pdf' },
      error: null,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    const reactNative = require('react-native');
    reactNative.Platform.OS = originalPlatform;
  });

  it('uploads blob-backed POP files on web without native filesystem reads', async () => {
    const { uploadPOPFile } = loadModule();
    const fileSystem = require('expo-file-system/legacy');

    const result = await uploadPOPFile(
      'blob:receipt-123',
      'proof_of_payment',
      'user-1',
      'student-1',
      'receipt.pdf'
    );

    expect(result).toEqual({
      success: true,
      filePath: 'user-1/student-1/stored-receipt.pdf',
      fileName: 'receipt.pdf',
      fileSize: expect.any(Number),
      fileType: 'application/pdf',
    });
    expect(storageFromMock).toHaveBeenCalledWith('proof-of-payments');
    expect(storageUploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/student-1\/.+\.pdf$/),
      expect.any(ArrayBuffer),
      expect.objectContaining({
        contentType: 'application/pdf',
        upsert: false,
      })
    );
    expect(fileSystem.getInfoAsync).not.toHaveBeenCalled();
    expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('blob:receipt-123');
  });

  it('uploads picker File objects on web without re-fetching the blob url', async () => {
    const { uploadPOPFile } = loadModule();
    const fileSystem = require('expo-file-system/legacy');
    const pdfBytes = new TextEncoder().encode('%PDF-1.4 picker receipt');
    const webFile = new Blob([pdfBytes], { type: 'application/pdf' });

    const result = await uploadPOPFile(
      'blob:receipt-from-picker',
      'proof_of_payment',
      'user-1',
      'student-1',
      'receipt.pdf',
      webFile
    );

    expect(result).toEqual({
      success: true,
      filePath: 'user-1/student-1/stored-receipt.pdf',
      fileName: 'receipt.pdf',
      fileSize: webFile.size,
      fileType: 'application/pdf',
    });
    expect(storageFromMock).toHaveBeenCalledWith('proof-of-payments');
    expect(storageUploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/student-1\/.+\.pdf$/),
      expect.any(ArrayBuffer),
      expect.objectContaining({
        contentType: 'application/pdf',
        upsert: false,
      })
    );
    expect(fileSystem.getInfoAsync).not.toHaveBeenCalled();
    expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

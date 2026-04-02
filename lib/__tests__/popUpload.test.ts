jest.mock('@/lib/supabase', () => {
  const upload = jest.fn();
  return {
    __esModule: true,
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({ data: { session: null } })),
      },
      storage: {
        from: jest.fn(() => ({
          upload,
        })),
      },
    },
  };
});

jest.mock('expo-image-manipulator', () => ({
  __esModule: true,
  manipulateAsync: jest.fn(),
  SaveFormat: {
    JPEG: 'jpeg',
  },
}));

jest.mock('expo-image-picker', () => ({
  __esModule: true,
  launchCameraAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
}));

jest.mock('@/lib/dash-ai/imageCompression', () => ({
  __esModule: true,
  compressImageForAI: jest.fn(),
}));

const { Platform } = require('react-native');
const { supabase } = require('@/lib/supabase');
const FileSystem = require('expo-file-system/legacy');
const { uploadPOPFile, validatePOPFile } = require('@/lib/popUpload');

describe('popUpload web handling', () => {
  const originalOs = Platform.OS;
  const originalFetch = global.fetch;

  beforeEach(() => {
    Platform.OS = 'web';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['pdf-data'], { type: 'application/pdf' }),
    })) as unknown as typeof fetch;
    jest.clearAllMocks();
  });

  afterEach(() => {
    Platform.OS = originalOs;
    global.fetch = originalFetch;
  });

  it('validates a browser blob URL without rewriting it to file://', async () => {
    const result = await validatePOPFile('blob:https://example.com/proof', 'proof_of_payment', 'receipt.pdf');

    expect(result).toEqual({
      isValid: true,
      errors: [],
      fileSize: 8,
      fileType: 'application/pdf',
    });
    expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('blob:https://example.com/proof');
  });

  it('uploads a browser blob URL through the web fetch path', async () => {
    const uploadMock = jest.fn(async () => ({ data: { path: 'user/student/receipt.pdf' }, error: null }));
    supabase.storage.from.mockReturnValue({ upload: uploadMock });

    const result = await uploadPOPFile(
      'blob:https://example.com/proof',
      'proof_of_payment',
      'user',
      'student',
      'receipt.pdf'
    );

    expect(result).toMatchObject({
      success: true,
      filePath: 'user/student/receipt.pdf',
      fileName: 'receipt.pdf',
      fileSize: 8,
      fileType: 'application/pdf',
    });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  it('uploads a provided browser file without refetching the blob URL', async () => {
    const uploadMock = jest.fn(async () => ({ data: { path: 'user/student/receipt.pdf' }, error: null }));
    const webFile = new Blob(['pdf-data'], { type: 'application/pdf' });
    supabase.storage.from.mockReturnValue({ upload: uploadMock });
    global.fetch = jest.fn(() => {
      throw new Error('fetch should not run when webFile is provided');
    }) as unknown as typeof fetch;

    const result = await uploadPOPFile(
      'blob:https://example.com/proof',
      'proof_of_payment',
      'user',
      'student',
      'receipt.pdf',
      webFile
    );

    expect(result).toMatchObject({
      success: true,
      filePath: 'user/student/receipt.pdf',
      fileName: 'receipt.pdf',
      fileSize: 8,
      fileType: 'application/pdf',
    });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

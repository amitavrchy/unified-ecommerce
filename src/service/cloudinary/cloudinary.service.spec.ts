import { InternalServerErrorException } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

function file(): Express.Multer.File {
  return {
    originalname: 'inlet.png',
    mimetype: 'image/png',
    buffer: Buffer.from('fake-png'),
  } as Express.Multer.File;
}

function lastRequest(): { url: string; fields: Record<string, string> } {
  const mock = global.fetch as jest.Mock;
  const [url, init] = mock.mock.calls[0] as [string, { body: FormData }];
  const fields: Record<string, string> = {};
  for (const [key, value] of init.body.entries())
    if (typeof value === 'string') fields[key] = value;
  return { url, fields };
}

function respondWith(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Bad Request',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe('CloudinaryService', () => {
  const env = process.env;
  let service: CloudinaryService;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_UPLOAD_PRESET;
    global.fetch = jest.fn();
    service = new CloudinaryService();
  });

  afterAll(() => {
    process.env = env;
  });

  it('signs the upload and omits the preset when none is configured', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
    process.env.CLOUDINARY_API_KEY = 'key-1';
    process.env.CLOUDINARY_API_SECRET = 'secret-1';
    respondWith(200, { secure_url: 'https://res.cloudinary.com/demo/a.png' });

    await expect(service.uploadFile(file(), 'vacuumCare/test')).resolves.toBe(
      'https://res.cloudinary.com/demo/a.png',
    );

    const { url, fields } = lastRequest();
    expect(url).toBe(
      'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
    );
    expect(fields.api_key).toBe('key-1');
    expect(fields.folder).toBe('vacuumCare/test');
    expect(fields.signature).toEqual(expect.any(String));
    expect(fields).not.toHaveProperty('upload_preset');
  });

  it('sends an unsigned preset upload when no key and secret exist', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
    process.env.CLOUDINARY_UPLOAD_PRESET = 'public-preset';
    respondWith(200, { secure_url: 'https://res.cloudinary.com/demo/a.png' });

    await service.uploadFile(file(), 'vacuumCare/test');

    const { fields } = lastRequest();
    expect(fields.upload_preset).toBe('public-preset');
    expect(fields).not.toHaveProperty('signature');
    expect(fields).not.toHaveProperty('api_key');
  });

  it("surfaces Cloudinary's reason when the upload is refused", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
    process.env.CLOUDINARY_API_KEY = 'key-1';
    process.env.CLOUDINARY_API_SECRET = 'secret-1';
    respondWith(400, { error: { message: 'Upload preset not found' } });

    await expect(
      service.uploadFile(file(), 'vacuumCare/test'),
    ).rejects.toThrow('Cloudinary upload failed: Upload preset not found');
  });

  it('refuses to upload when neither credentials nor a preset are set', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';

    await expect(
      service.uploadFile(file(), 'vacuumCare/test'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('routes a video to the video resource endpoint', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
    process.env.CLOUDINARY_API_KEY = 'key-1';
    process.env.CLOUDINARY_API_SECRET = 'secret-1';
    respondWith(200, { secure_url: 'https://res.cloudinary.com/demo/a.mp4' });

    await service.uploadFile(
      { ...file(), mimetype: 'video/mp4' } as Express.Multer.File,
      'vacuumCare/test',
    );

    expect(lastRequest().url).toBe(
      'https://api.cloudinary.com/v1_1/demo-cloud/video/upload',
    );
  });
});

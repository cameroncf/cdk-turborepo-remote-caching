import { TokenConfig, TokenStorage } from './constants';
import { initTokenConfig, initTokenValue } from './edge';

jest.mock('@aws-sdk/client-ssm', () => {
  const originalModule = jest.requireActual('@aws-sdk/client-ssm');

  return {
    __esModule: true,
    ...originalModule,
    SSMClient: jest.fn().mockImplementation(() => {
      return {
        send: jest.fn(() => {
          return Promise.resolve({
            Parameter: {
              Value: JSON.stringify({
                tokenStorage: TokenStorage.PARAMETER_STORE,
                tokenSecretRotationMinutes: 1440,
                tokenSecretName: 'foo',
                tokenSecretRegion: 'bar',
              }),
            },
          });
        }),
      };
    }),
  };
});

describe('Init Config', () => {
  it("should retrieve configuration if it's undefined", async () => {
    const ssmParamName = 'foo';
    let tokenConfig: TokenConfig;
    const result = await initTokenConfig(ssmParamName, tokenConfig!);
    expect(result).toBe(true);
  });

  it("should not update configuration if it's already defined", async () => {
    const ssmParamName = 'foo';
    const result = await initTokenConfig(ssmParamName, {
      tokenStorage: TokenStorage.PARAMETER_STORE,
      tokenSecretRotationMinutes: 1440,
      tokenSecretName: 'foo',
      tokenSecretRegion: 'bar',
    });
    expect(result).toBe(false);
  });
});

describe('Init Value', () => {
  it("should retrieve value if it's undefined", async () => {
    const ssmParamName = 'foo';
    let tokenValue: string;
    const result = await initTokenValue(ssmParamName, tokenValue!);
    expect(result).toBe(true);
  });

  it("should not update value if it's already defined", async () => {
    const ssmParamName = 'foo';
    const result = await initTokenValue(ssmParamName, 'foo-bar-baz');
    expect(result).toBe(false);
  });
});

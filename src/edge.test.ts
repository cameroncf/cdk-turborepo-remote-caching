import { CloudFrontResultResponse } from 'aws-lambda';
import { ERROR_AUTH_HEADER_FAILED, ERROR_AUTH_HEADER_MISSING, ERROR_AUTH_HEADER_NOT_BEARER, ERROR_PARAM_STORE_CONFIG, TokenConfig, TokenStorage } from './constants';
import { handler, initTokenConfig, initTokenValue } from './edge';
import { contextMock, goodParamNameFixture, goodTokenFixture, viewerRequestFixtureMisconfiguredAuth, viewerRequestFixtureNoAuth, viewerRequestFixtureWithBadAuth, viewerRequestFixtureWithGoodAuth } from './edge.fixtures';


jest.mock('@aws-sdk/client-ssm', () => {
  const originalModule = jest.requireActual('@aws-sdk/client-ssm');

  return {
    __esModule: true,
    ...originalModule,
    SSMClient: jest.fn().mockImplementation(() => {
      return {
        send: jest.fn((command) => {
          const returnValue = command.input.Name === goodParamNameFixture ? {
            Parameter: {
              Value: JSON.stringify(goodTokenFixture),
            },
          } : {};
          return Promise.resolve(returnValue);
        }),
      };
    }),
  };
});


describe('Init Config', () => {

  it('should fail if param is wrong or missing', async () => {
    const ssmParamName = 'invalid-param-value';
    let tokenConfig: TokenConfig;
    await expect(async () => {
      await initTokenConfig(ssmParamName, tokenConfig!);
    }).rejects.toThrowError(ERROR_PARAM_STORE_CONFIG);
  });

  it("should retrieve configuration if it's undefined", async () => {
    const ssmParamName = goodParamNameFixture;
    let tokenConfig: TokenConfig;
    const result = await initTokenConfig(ssmParamName, tokenConfig!);
    expect(result).toBe(true);
  });

  it("should not update configuration if it's already defined", async () => {
    const ssmParamName = goodParamNameFixture;
    const result = await initTokenConfig(ssmParamName, {
      tokenStorage: TokenStorage.PARAMETER_STORE,
      remoteApiEndpoint: 'foo',
      tokenValue: 'bar',
    });
    expect(result).toBe(false);
  });
});

describe('Init Value', () => {
  it("should retrieve value if it's undefined", async () => {
    let tokenValue: string;
    const result = await initTokenValue(tokenValue!);
    expect(result).toBe(true);
  });

  it("should not update value if it's already defined", async () => {
    const result = await initTokenValue('foo-bar-baz');
    expect(result).toBe(false);
  });
});

describe('Handler', () => {
  it('should fail without auth header', async () => {
    const result = await handler(viewerRequestFixtureNoAuth, contextMock, jest.fn()) as CloudFrontResultResponse;
    expect(result.status).toBe('401');
    expect(result.body).toBe(ERROR_AUTH_HEADER_MISSING);
  });

  it('should fail with misconfigured auth header', async () => {
    const result = await handler(viewerRequestFixtureMisconfiguredAuth, contextMock, jest.fn()) as CloudFrontResultResponse;
    expect(result.status).toBe('401');
    expect(result.body).toBe(ERROR_AUTH_HEADER_NOT_BEARER);
  });

  it('should fail with bad auth header', async () => {
    const result = await handler(viewerRequestFixtureWithBadAuth, contextMock, jest.fn()) as CloudFrontResultResponse;
    expect(result.status).toBe('401');
    expect(result.body).toBe(ERROR_AUTH_HEADER_FAILED);
  });

  it('should succeed with good auth header', async () => {
    const result = await handler(viewerRequestFixtureWithGoodAuth, contextMock, jest.fn()) as CloudFrontResultResponse;
    expect(result).toEqual(viewerRequestFixtureWithGoodAuth.Records[0].cf.request);
  });
});

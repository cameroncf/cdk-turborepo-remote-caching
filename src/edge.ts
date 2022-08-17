import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { CloudFrontRequestHandler } from 'aws-lambda';
import {
  ERROR_AUTH_HEADER_FAILED,
  ERROR_AUTH_HEADER_MISSING,
  ERROR_AUTH_HEADER_NOT_BEARER,
  ERROR_PARAM_STORE_CONFIG,
  SSM_PARAMETER_NAMESPACE,
  TokenConfig,
  TokenStorage,
  TOKEN_CONFIG_NAME,
} from './constants';
import { unauthResponse } from './util/error-response';

/**
 *  Allow token data to persist between lambda executions to prevent request to
 *  Param store on each request. We store the expiration here as well
 */
let tokenConfig: TokenConfig;
let tokenValue: string;

export const handler: CloudFrontRequestHandler = async (event, context) => {
  console.log('event', JSON.stringify(event, null, 2));
  console.log('context', JSON.stringify(context, null, 2));
  console.log('context.functionName', context.functionName);

  // discover the param name that stores the configuration
  const ssmConfigParamName = `${SSM_PARAMETER_NAMESPACE}/${TOKEN_CONFIG_NAME}`;

  // init the configuration, if needed
  try {
    await initTokenConfig(ssmConfigParamName, tokenConfig);
  } catch (e) {
    unauthResponse(ERROR_PARAM_STORE_CONFIG);
  }

  // get the token secret value
  await initTokenValue(tokenValue);

  // pull cf request out of viewer event
  const { cf } = event.Records[0];

  // validate token existance and format
  const authorization = cf.request.headers.authorization;

  // validations
  if (authorization === undefined || authorization[0]?.value === undefined) {
    return unauthResponse(ERROR_AUTH_HEADER_MISSING);
  }
  if (!authorization[0].value.startsWith('Bearer')) {
    return unauthResponse(ERROR_AUTH_HEADER_NOT_BEARER);
  }

  // token match?
  if (tokenValue !== authorization[0].value.split(' ')[1]) {
    return unauthResponse(ERROR_AUTH_HEADER_FAILED);
  }

  // if we reached this point, we're all good!
  return cf.request;
};

export const initTokenConfig = async (
  ssmConfigParamName: string,
  currentValue?: TokenConfig,
): Promise<boolean> => {
  if (currentValue === undefined) {
    const ssmClient = new SSMClient({ region: 'us-east-1' });
    const getParameterCommand = new GetParameterCommand({
      Name: ssmConfigParamName,
    });

    const response = await ssmClient.send(getParameterCommand);

    // nothing was returned
    if (!response.Parameter?.Value) {
      throw new Error(ERROR_PARAM_STORE_CONFIG);
    }

    // set configuration to global scope here
    tokenConfig = JSON.parse(response.Parameter.Value);

    console.log('tokenConfig', JSON.stringify(tokenConfig, null, 2));
    return true;
  }
  return false;
};

export const initTokenValue = async (
  currentValue?: string,
): Promise<boolean> => {
  if (currentValue === undefined) {

    // if might be in the config already
    if (tokenConfig.tokenStorage === TokenStorage.PARAMETER_STORE) {
      tokenValue = tokenConfig.tokenValue;
    }
    return true;
  }
  return false;
};

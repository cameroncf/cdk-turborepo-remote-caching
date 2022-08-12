import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import type { CloudFrontRequestHandler } from 'aws-lambda';
import {
  SSM_PARAMETER_NAMESPACE,
  TokenConfig,
  TOKEN_CONFIG_NAME,
  TOKEN_VALUE_NAME,
} from './constants';

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
  const ssmValueParamName = `${SSM_PARAMETER_NAMESPACE}/${TOKEN_VALUE_NAME}`;

  // init the configuration, if needed
  await initTokenConfig(ssmConfigParamName, tokenConfig);

  // retrieve token value, if needed
  await initTokenValue(ssmValueParamName, tokenValue);

  // pull cf request out of viewer event
  const { cf } = event.Records[0];

  // validate token existance and format
  const authorization = cf.request.headers.authorization;
  console.log('authorization', authorization);
  /*
  assert(
    authorization && authorization[0].value,
    "authorization header is missing"
  );
  assert(
    authorization[0].value.startsWith("Bearer"),
    "authorization header is not bearer"
  );
  */

  // token match!
  if (tokenValue === authorization[0].value.split(' ')[1]) {
    return cf.request;
  }

  // bad token! bad! very bad!
  return {
    status: '401',
    headers: {
      'cache-control': [
        {
          key: 'Cache-Control',
          value: 'no-cache, no-store, max-age=0, must-revalidate',
        },
      ],
      'pragma': [
        {
          key: 'Pragma',
          value: 'no-cache',
        },
      ],
    },
    body: 'Not Authorized.',
  };
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
      throw new Error(
        `The configuration parameter named ${ssmConfigParamName} was not found in param store`,
      );
    }

    // set configuration to global scope here
    tokenConfig = JSON.parse(response.Parameter.Value);

    console.log('tokenConfig', JSON.stringify(tokenConfig, null, 2));
    return true;
  }
  return false;
};

export const initTokenValue = async (
  ssmValueParamName: string,
  currentValue?: string,
): Promise<boolean> => {
  if (currentValue === undefined) {
    const ssmClient = new SSMClient({ region: 'us-east-1' });
    const getParameterCommand = new GetParameterCommand({
      Name: ssmValueParamName,
    });
    const response = await ssmClient.send(getParameterCommand);

    // nothing was returned
    if (!response.Parameter?.Value) {
      throw new Error(
        `The token value parameter named ${ssmValueParamName} was not found in param store`,
      );
    }

    // set configuration to global scope here
    tokenValue = response.Parameter.Value;
    console.log('tokenValue', JSON.stringify(tokenValue, null, 2));
    return true;
  }
  return false;
};

/**
 *  Root namespace for token values.
 */
export const SSM_PARAMETER_NAMESPACE = '/lambda-at-edge/turborepo';
/**
 *  Used to store the token's configutration in Param Store.
 */
export const TOKEN_CONFIG_NAME = 'TOKEN_CONFIG';

/**
 *
 *  Available configurations to store tokens at AWS.
 */
export enum TokenStorage {
  'PARAMETER_STORE' = 'PARAMETER_STORE',
  'SECRETS_MANAGER' = 'SECRETS_MANAGER',
}

/**
 * Describes the configuration of how the token is stored at AWS
 */
export type TokenConfig = {
  tokenStorage: TokenStorage;
  remoteApiEndpoint: string;
  tokenValue: string;
};

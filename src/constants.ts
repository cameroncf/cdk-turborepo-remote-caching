/**
 *  Root namespace for token values.
 */
export const SSM_PARAMETER_NAMESPACE = '/lambda-at-edge/turborepo';
/**
 *  Used to store the token's configutration in Param Store.
 */
export const TOKEN_CONFIG_NAME = 'TOKEN_CONFIG';
/**
 *  Used to store token when token is stored directly in param store.
 */
export const TOKEN_VALUE_NAME = 'TOKEN_VALUE';
/**
 *  Used to store API endpoint for turborepo.
 */
export const REMOTE_API_ENDPOINT = 'REMOTE_API_ENDPOINT';

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
};

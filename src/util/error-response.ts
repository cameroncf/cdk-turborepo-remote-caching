

export const unauthResponse = (message?: string) => {
  const body = message ? `Not Authorized - ${message}` : 'Not Authorized';
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
    body,
  };
};

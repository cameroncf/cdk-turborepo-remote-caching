import { CloudFrontResultResponse } from 'aws-lambda';

export const unauthResponse = (message: string): CloudFrontResultResponse => {
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
    body: message,
  };
};


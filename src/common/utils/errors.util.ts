import axios from 'axios';

export function extractErrorDetails(error: unknown) {
  if (axios.isAxiosError(error)) {
    return {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    };
  }

  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  return error;
}

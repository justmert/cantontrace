/**
 * CommandCompletionService wrapper — CompletionStream (streaming)
 *
 * Provides async command outcome monitoring.
 *
 * In Canton 3.4+, CompletionStreamRequest uses `user_id` instead of `application_id`.
 * The `begin_exclusive` offset is an int64 (sent as string via proto-loader).
 */

import type * as grpc from '@grpc/grpc-js';
import type { CompletionStreamResponse, Completion } from '../proto/types.js';
import { createMetadata, makeServerStreamCall, timestampToISO } from './shared.js';
import type { CommandCompletion } from '../../types.js';
import { grpcErrorToCommandError } from '../errors.js';

export class CommandCompletionServiceClient {
  constructor(
    private readonly client: grpc.Client,
    private readonly getToken: () => string | null,
  ) {}

  /**
   * Subscribe to the completion stream.
   *
   * @param applicationId - Application/user ID for completions.
   *   In Canton 3.4+, this maps to the `user_id` field.
   * @param parties - Parties to filter completions for.
   * @param beginExclusive - Optional start offset (int64 as string).
   * @param onCompletion - Callback for each completion.
   * @param onError - Error callback.
   * @param onEnd - End callback.
   * @returns Cancel function.
   */
  streamCompletions(
    applicationId: string,
    parties: string[],
    beginExclusive?: string,
    onCompletion?: (completion: CommandCompletion) => void,
    onError?: (error: Error) => void,
    onEnd?: () => void,
  ): { cancel: () => void } {
    const metadata = createMetadata(this.getToken());

    // Canton 3.4+: CompletionStreamRequest uses user_id, not application_id
    const request: Record<string, unknown> = {
      user_id: applicationId,
      parties,
    };

    if (beginExclusive) {
      request.begin_exclusive = beginExclusive;
    }

    const stream = makeServerStreamCall(this.client, 'CompletionStream', request, metadata);

    stream.on('data', (data: CompletionStreamResponse) => {
      if (data.completion && onCompletion) {
        onCompletion(mapCompletion(data.completion));
      }
    });

    stream.on('error', (error: Error) => {
      onError?.(error);
    });

    stream.on('end', () => {
      onEnd?.();
    });

    return {
      cancel: () => {
        stream.cancel();
      },
    };
  }

  /**
   * Collect completions over a finite range.
   *
   * @param applicationId - Application ID.
   * @param parties - Parties filter.
   * @param beginExclusive - Start offset.
   * @param endInclusive - End offset.
   * @param commandIdFilter - Optional command ID to filter for.
   */
  async getCompletions(
    applicationId: string,
    parties: string[],
    beginExclusive?: string,
    _endInclusive?: string,
    commandIdFilter?: string,
  ): Promise<CommandCompletion[]> {
    return new Promise((resolve, reject) => {
      const completions: CommandCompletion[] = [];
      const timeout = setTimeout(() => {
        sub.cancel();
        resolve(completions);
      }, 1000); // 1s timeout — completion stream stays open indefinitely in idle sandboxes

      const sub = this.streamCompletions(
        applicationId,
        parties,
        beginExclusive,
        (completion) => {
          if (commandIdFilter && completion.commandId !== commandIdFilter) {
            return;
          }
          completions.push(completion);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        () => {
          clearTimeout(timeout);
          resolve(completions);
        },
      );
    });
  }
}

function mapCompletion(completion: Completion): CommandCompletion {
  const succeeded = completion.status?.code === 0;

  let error = undefined;
  if (!succeeded && completion.status) {
    error = grpcErrorToCommandError(completion.status);
  }

  return {
    commandId: completion.command_id,
    submissionId: completion.submission_id || undefined,
    updateId: completion.update_id || undefined,
    status: succeeded ? 'succeeded' : 'failed',
    offset: completion.offset,
    recordTime: completion.record_time ? timestampToISO(completion.record_time) : '',
    actAs: completion.act_as ?? [],
    error,
  };
}

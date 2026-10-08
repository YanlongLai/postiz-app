import { proxySinks, WorkflowInterceptors } from '@temporalio/workflow';

const sink = proxySinks<{
  receiptReplay: { activity: (input: unknown) => void };
}>();

export function interceptors(): WorkflowInterceptors {
  return {
    outbound: [
      {
        scheduleActivity(input, next) {
          sink.receiptReplay.activity({
            activityType: input.activityType,
            args: input.args,
            taskQueue: input.options.taskQueue,
          });
          return next(input);
        },
      },
    ],
  };
}

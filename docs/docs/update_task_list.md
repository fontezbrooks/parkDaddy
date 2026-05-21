# List of Issues to Resolve for Update

> The following are a list of issues that need to be resolved to release an update for this app. The app is currently live on the Apple App store. Some issues are code issues others are issues that need to be resolved outside of the app. And others are new feature requests from users. We want them all resolved.

## Notifications

> Even though we have notifications setup in the app store, users do not receive notifications. In fact, in the settings for the app there are no notification options. And in the Notification settings in general parkDaddy is not even listed.

## Users want an On/Off switch for parking

> Currently, we allow users to pick their parking duration; however, after user feedback users only only want 1 option(Parking On, Parking Off). What this means for us is we default to 24 hours. On the backend whatever we're doing to reserve parking for 24 hours default to that. This creates two new usecases:
    1. We need a notification sent to the users device when parking is about to expire giving them the option to renew or extend.
    2. Users should have the option to renew or extend no matter what. So in total there would be 2 options(Park(on/off) & extend)

## Google Play store submission

> Apple app store was the MVP for V1 now we're past that and need to gather intel on how to publish to Google play store. I have never submitted an app to play store so we need granular details for beginners

## I want to test if we can use 24 hours as the default park time

> Currently, without parkdaddy, users parking with parkeaz using the guest code(the workflow parkDaddy automates) default to 2 hour time limits and we just extend based on the users time limit choice. I want a throwaway test to see if we can send a 24 hour time limit by default or are we locked to 2 hour time limits because of the guest code usage. If we can't then disregard this test and continue, if we can I want to each user to be automatically registered to park for 24 hours at a time.

Do you have any clarifying questions for me?
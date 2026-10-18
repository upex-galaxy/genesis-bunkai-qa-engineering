/**
 * KATA Framework - Type Facade: Workspace Content Domain
 *
 * Create payloads/responses for the content chain that seeds a workspace:
 * project -> environment / module -> user story -> acceptance criterion
 * -> ATC -> test -> run -> finish.
 *
 * Consumed by: tests/components/api/{ProjectsApi,UserStoriesApi,AtcsApi,TestsApi,RunsApi}.ts
 */

import type { components, paths } from '@openapi';

// ============================================================================
// Schema Types (from components.schemas)
// ============================================================================

export type Project = components['schemas']['Project'];
export type ProjectEnvironment = components['schemas']['ProjectEnvironment'];
export type Module = components['schemas']['Module'];
export type UserStory = components['schemas']['UserStory'];
export type AcceptanceCriterion = components['schemas']['AcceptanceCriterion'];
export type Atc = components['schemas']['Atc'];
export type Test = components['schemas']['Test'];
export type Run = components['schemas']['Run'];

// ============================================================================
// Endpoint Types - POST /api/v1/workspaces/{id}/projects
// ============================================================================

type CreateProjectPath = paths['/api/v1/workspaces/{id}/projects']['post'];

export type CreateProjectPayload = NonNullable<CreateProjectPath['requestBody']>['content']['application/json'];
export type CreateProjectResponse = CreateProjectPath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/projects/{id}/environments
// ============================================================================

type CreateEnvironmentPath = paths['/api/v1/projects/{id}/environments']['post'];

export type CreateEnvironmentPayload = NonNullable<CreateEnvironmentPath['requestBody']>['content']['application/json'];
export type CreateEnvironmentResponse = CreateEnvironmentPath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/projects/{id}/modules
// ============================================================================

type CreateModulePath = paths['/api/v1/projects/{id}/modules']['post'];

export type CreateModulePayload = NonNullable<CreateModulePath['requestBody']>['content']['application/json'];
export type CreateModuleResponse = CreateModulePath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/modules/{id}/user-stories
// ============================================================================

type CreateUserStoryPath = paths['/api/v1/modules/{id}/user-stories']['post'];

export type CreateUserStoryPayload = NonNullable<CreateUserStoryPath['requestBody']>['content']['application/json'];
export type CreateUserStoryResponse = CreateUserStoryPath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/user-stories/{id}/acceptance-criteria
// ============================================================================

type CreateAcceptanceCriterionPath = paths['/api/v1/user-stories/{id}/acceptance-criteria']['post'];

export type CreateAcceptanceCriterionPayload = NonNullable<CreateAcceptanceCriterionPath['requestBody']>['content']['application/json'];
export type CreateAcceptanceCriterionResponse = CreateAcceptanceCriterionPath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/atcs
// ============================================================================

type CreateAtcPath = paths['/api/v1/atcs']['post'];

export type CreateAtcPayload = NonNullable<CreateAtcPath['requestBody']>['content']['application/json'];
export type CreateAtcResponse = CreateAtcPath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/tests (requires Idempotency-Key)
// ============================================================================

type CreateTestPath = paths['/api/v1/tests']['post'];

export type CreateTestPayload = NonNullable<CreateTestPath['requestBody']>['content']['application/json'];
export type CreateTestResponse = CreateTestPath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/runs (requires Idempotency-Key)
// ============================================================================

type CreateRunPath = paths['/api/v1/runs']['post'];

export type CreateRunPayload = NonNullable<CreateRunPath['requestBody']>['content']['application/json'];
export type CreateRunResponse = CreateRunPath['responses']['201']['content']['application/json'];

// ============================================================================
// Endpoint Types - POST /api/v1/runs/{id}/finish
// ============================================================================

type FinishRunPath = paths['/api/v1/runs/{id}/finish']['post'];

export type FinishRunPayload = NonNullable<FinishRunPath['requestBody']>['content']['application/json'];
export type FinishRunResponse = FinishRunPath['responses']['200']['content']['application/json'];

/** Final verdict accepted by the finish route. */
export type RunVerdict = FinishRunPayload['verdict'];

# FoodBlock Server — AWS Setup

One-time AWS setup required before the CI/CD pipeline will work.

## 1. Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name foodblock-server \
  --region eu-west-2
```

## 2. Create ECS Service

Create a service `foodblock-service` in the existing `prod-new` cluster:

```bash
aws ecs create-service \
  --cluster prod-new \
  --service-name foodblock-service \
  --task-definition foodblock-server \
  --desired-count 1 \
  --launch-type EC2
```

## 3. Create Database Secret

Store the PostgreSQL connection string in Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name foodblock/database-url \
  --region eu-west-2 \
  --secret-string '{"DATABASE_URL":"postgresql://foodblock:<password>@<rds-host>:5432/foodblock"}'
```

## 4. Add GitHub Secrets

In the FoodBlock repo settings (github.com/FoodXDevelopment/FoodBlock/settings/secrets):

- `AWS_ACCESS_KEY_ID` — same as Backend repo (or create dedicated IAM user)
- `AWS_SECRET_ACCESS_KEY` — same as Backend repo

Also create a GitHub Environment called `production`.

## 5. ALB Target Group (if using path-based routing)

If serving behind the same ALB as the Backend, create a target group for port 3111
and add a path rule (e.g. `/foodblock/*`) pointing to it. Set `BASE_PATH=/foodblock`
in the task definition environment.

## Pipeline Flow

```
Push to main → Tests (JS, Python, Go, Swift, Server) → Build Docker → Push ECR → Deploy ECS
```

Only deploys if JS SDK, Python SDK, and Server tests all pass.

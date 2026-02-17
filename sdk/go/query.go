package foodblock

// QueryParams holds query parameters for searching blocks.
type QueryParams struct {
	Type         string
	Refs         map[string]string
	StateFilters []StateFilter
	Limit        int
	Offset       int
	HeadsOnly    bool
}

// StateFilter represents a filter condition on block state fields.
type StateFilter struct {
	Field string
	Op    string // "eq", "lt", "gt"
	Value interface{}
}

// QueryBuilder provides a fluent query interface for finding blocks.
type QueryBuilder struct {
	resolve func(QueryParams) ([]Block, error)
	params  QueryParams
}

// NewQuery creates a new QueryBuilder with a resolve function.
func NewQuery(resolve func(QueryParams) ([]Block, error)) *QueryBuilder {
	return &QueryBuilder{
		resolve: resolve,
		params: QueryParams{
			Refs:  make(map[string]string),
			Limit: 50,
		},
	}
}

// Type filters by block type.
func (q *QueryBuilder) Type(t string) *QueryBuilder {
	q.params.Type = t
	return q
}

// ByRef filters by a reference role and hash.
func (q *QueryBuilder) ByRef(role, hash string) *QueryBuilder {
	q.params.Refs[role] = hash
	return q
}

// WhereEq adds an equality filter on a state field.
func (q *QueryBuilder) WhereEq(field string, value interface{}) *QueryBuilder {
	q.params.StateFilters = append(q.params.StateFilters, StateFilter{Field: field, Op: "eq", Value: value})
	return q
}

// WhereLt adds a less-than filter on a state field.
func (q *QueryBuilder) WhereLt(field string, value interface{}) *QueryBuilder {
	q.params.StateFilters = append(q.params.StateFilters, StateFilter{Field: field, Op: "lt", Value: value})
	return q
}

// WhereGt adds a greater-than filter on a state field.
func (q *QueryBuilder) WhereGt(field string, value interface{}) *QueryBuilder {
	q.params.StateFilters = append(q.params.StateFilters, StateFilter{Field: field, Op: "gt", Value: value})
	return q
}

// Latest restricts results to head blocks only (latest in update chains).
func (q *QueryBuilder) Latest() *QueryBuilder {
	q.params.HeadsOnly = true
	return q
}

// Limit sets the maximum number of results.
func (q *QueryBuilder) Limit(n int) *QueryBuilder {
	q.params.Limit = n
	return q
}

// Offset sets the number of results to skip.
func (q *QueryBuilder) Offset(n int) *QueryBuilder {
	q.params.Offset = n
	return q
}

// Exec executes the query and returns matching blocks.
func (q *QueryBuilder) Exec() ([]Block, error) {
	return q.resolve(q.params)
}
